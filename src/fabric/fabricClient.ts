import { Gateway, Network, Contract, Wallet, Wallets } from 'fabric-network';
import FabricCAServices from 'fabric-ca-client';
import { X509Identity } from 'fabric-network';
import * as fs from 'fs';
import * as path from 'path';
import { CaptureData, FabricTransaction } from '../types';

export class FabricClient {
  private gateway: Gateway | null = null;
  private network: Network | null = null;
  private contract: Contract | null = null;
  private wallet: Wallet | null = null;
  private caClient: FabricCAServices | null = null;

  // Configuration from environment
  private readonly caUrl: string;
  private readonly peerUrl: string;
  private readonly ordererUrl: string;
  private readonly channelName: string;
  private readonly chaincodeName: string;
  private readonly mspId: string;
  private readonly adminUser: string;
  private readonly adminPassword: string;
  private readonly walletPath: string;

  constructor() {
    this.caUrl = process.env.FABRIC_CA_URL || 'http://greenstand-ca-service.hlf-ca.svc.cluster.local:7058';
    this.peerUrl = process.env.FABRIC_PEER_URL || 'grpcs://peer0-greenstand.hlf-peer-org.svc.cluster.local:7051';
    this.ordererUrl = process.env.FABRIC_ORDERER_URL || 'grpcs://orderer0.hlf-orderer.svc.cluster.local:7050';
    this.channelName = process.env.FABRIC_CHANNEL_NAME || 'treechannelv2';
    this.chaincodeName = process.env.FABRIC_CHAINCODE_NAME || 'tree-contract';
    this.mspId = process.env.FABRIC_MSP_ID || 'GreenstandardMSP';
    this.adminUser = process.env.FABRIC_ADMIN_USER || 'admin';
    this.adminPassword = process.env.FABRIC_ADMIN_PASSWORD || 'adminpw';
    this.walletPath = path.join(process.cwd(), 'wallet');
  }

  private async initializeWallet(): Promise<void> {
    if (this.wallet) return;

    // Create wallet directory if it doesn't exist
    if (!fs.existsSync(this.walletPath)) {
      fs.mkdirSync(this.walletPath, { recursive: true });
    }

    this.wallet = await Wallets.newFileSystemWallet(this.walletPath);
  }

  private async enrollAdmin(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    // Check if admin is already enrolled
    const adminExists = await this.wallet.get(this.adminUser);
    if (adminExists) {
      // Ensure MSP ID matches current configuration
      const existingMsp = (adminExists as any).mspId || (adminExists as any).credentials?.mspId;
      if (existingMsp && existingMsp !== this.mspId) {
        console.warn(`Admin identity MSP mismatch (${existingMsp} != ${this.mspId}), re-enrolling admin`);
        await this.wallet.remove(this.adminUser);
      } else {
        console.log(`Admin user ${this.adminUser} already exists in wallet`);
        return;
      }
    }

    // Initialize CA client with TLS options for self-signed certificates
    const caClientOptions = {
      trustedRoots: [],   // Empty array to accept self-signed certificates
      verify: false,      // Disable certificate verification
      // Additional TLS options to handle connection issues
      tlsOptions: {
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_2_method'
      }
    };
    
    console.log('Initializing Fabric CA client with URL:', this.caUrl);
    this.caClient = new FabricCAServices(this.caUrl, caClientOptions);

    try {
      console.log(`Attempting to enroll admin user: ${this.adminUser}`);
      console.log('CA URL:', this.caUrl);
      
      // Enroll admin
      const enrollment = await this.caClient.enroll({
        enrollmentID: this.adminUser,
        enrollmentSecret: this.adminPassword
      });
      
      console.log('Admin enrollment successful');

      const x509Identity: X509Identity = {
        credentials: {
          certificate: enrollment.certificate,
          privateKey: enrollment.key.toBytes(),
        },
        mspId: this.mspId,
        type: 'X.509',
      };

      await this.wallet.put(this.adminUser, x509Identity);
      console.log(`Successfully enrolled admin user ${this.adminUser}`);
    } catch (error) {
      console.error(`Failed to enroll admin user: ${error}`);
      throw error;
    }
  }

  public async enrollUser(username: string, userId: string): Promise<void> {
    if (!this.wallet || !this.caClient) {
      throw new Error('Fabric client not initialized');
    }

    // Check if user already enrolled
    const userExists = await this.wallet.get(username);
    if (userExists) {
      const existingMsp = (userExists as any).mspId || (userExists as any).credentials?.mspId;
      if (existingMsp && existingMsp !== this.mspId) {
        console.warn(`User ${username} MSP mismatch (${existingMsp} != ${this.mspId}), removing stale identity`);
        await this.wallet.remove(username);
      } else {
        console.log(`User ${username} already exists in wallet`);
        return;
      }
    }

    try {
      // Get admin identity for registration
      const adminIdentity = await this.wallet.get(this.adminUser);
      if (!adminIdentity) {
        throw new Error('Admin user not found in wallet');
      }

      // Create user context
      const provider = this.wallet.getProviderRegistry().getProvider(adminIdentity.type);
      const adminUser = await provider.getUserContext(adminIdentity, this.adminUser);

      // Register user (skip if already registered)
      let secret: string;
      try {
        secret = await this.caClient.register(
          {
            enrollmentID: username,
            role: 'client',
            affiliation: '',
            attrs: [
              { name: 'userId', value: userId, ecert: true },
              { name: 'role', value: 'user', ecert: true }
            ]
          },
          adminUser
        );
      } catch (error: any) {
        if (error.errors && error.errors[0] && error.errors[0].code === 74) {
          // User already registered, skip to wallet enrollment without CA enrollment
          console.log(`User ${username} already registered, skipping registration and enrollment`);
          return;
        } else {
          throw error;
        }
      }

      // Enroll user
      const enrollment = await this.caClient.enroll({
        enrollmentID: username,
        enrollmentSecret: secret
      });

      const x509Identity: X509Identity = {
        credentials: {
          certificate: enrollment.certificate,
          privateKey: enrollment.key.toBytes(),
        },
        mspId: this.mspId,
        type: 'X.509',
      };

      await this.wallet.put(username, x509Identity);
      console.log(`Successfully enrolled user ${username}`);
    } catch (error) {
      console.error(`Failed to enroll user ${username}: ${error}`);
      throw error;
    }
  }

  public async connect(username: string = this.adminUser): Promise<void> {
    try {
      await this.initializeWallet();
      await this.enrollAdmin();

      this.gateway = new Gateway();
      
      // Connection profile for the peer with TLS configuration
      const connectionProfile = {
        name: 'treetracker-network',
        version: '1.0.0',
        client: {
          organization: 'Greenstand',
          connection: {
            timeout: {
              peer: {
                endorser: '30000',
                eventHub: '60000',
                eventReg: '30000'
              },
              orderer: '30000'
            }
          }
        },
        organizations: {
          Greenstand: {
            mspid: this.mspId,
            peers: ['peer0-greenstand']
          },
          Cbo: {
            mspid: 'CboMSP',
            peers: ['peer0-cbo']
          },
          Investor: {
            mspid: 'InvestorMSP',
            peers: ['peer0-investor']
          },
          Verifier: {
            mspid: 'VerifierMSP',
            peers: ['peer0-verifier']
          }
        },
        orderers: {
          'orderer0': {
            url: this.ordererUrl,
            tlsCACerts: {
              pem: `-----BEGIN CERTIFICATE-----
MIICFzCCAb2gAwIBAgIUBRPqFpAbwJHD1VEQdPIWfRUDu9EwCgYIKoZIzj0EAwIw
aDELMAkGA1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQK
EwtIeXBlcmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMt
Y2Etc2VydmVyMB4XDTI1MDkyMzE5NTUwMFoXDTQwMDkxOTE5NTUwMFowaDELMAkG
A1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQKEwtIeXBl
cmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMtY2Etc2Vy
dmVyMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEMw86fZ0ac7pRGpzfbJrsRu9e
uMfXH8by/QgH27zLpCtECotBZp4qU8yncSf2/hRF1SVGF68HzxieX3ZFelQMlKNF
MEMwDgYDVR0PAQH/BAQDAgEGMBIGA1UdEwEB/wQIMAYBAf8CAQEwHQYDVR0OBBYE
FG5ohbpEcnWRS1X1Q6WjtJe91HSnMAoGCCqGSM49BAMCA0gAMEUCIQDcLkYjacCG
tVJTM3Qn6s56oFqw7fkcR3O78a0xPngVmwIgcisFj3z7VSt96U4EnhnBoMAOvvLy
mrQZo5uejmKXeC0=
-----END CERTIFICATE-----`
            },
            grpcOptions: {
              'ssl-target-name-override': 'orderer0'
            }
          }
        },
        channels: {
          [this.channelName]: {
            orderers: ['orderer0'],
            peers: {
              'peer0-greenstand': {
                endorsingPeer: true,
                chaincodeQuery: true,
                ledgerQuery: true,
                eventSource: true
              },
              'peer0-cbo': {
                endorsingPeer: true,
                chaincodeQuery: true,
                ledgerQuery: true,
                eventSource: true
              },
              'peer0-investor': {
                endorsingPeer: true,
                chaincodeQuery: true,
                ledgerQuery: true,
                eventSource: true
              },
              'peer0-verifier': {
                endorsingPeer: true,
                chaincodeQuery: true,
                ledgerQuery: true,
                eventSource: true
              }
            }
          }
        },
        peers: {
          'peer0-greenstand': {
            url: this.peerUrl,
            tlsCACerts: {
              pem: `-----BEGIN CERTIFICATE-----
MIICFzCCAb2gAwIBAgIUMy+3NjugExLmVsbjqkjn2fJttMgwCgYIKoZIzj0EAwIw
aDELMAkGA1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQK
EwtIeXBlcmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMt
Y2Etc2VydmVyMB4XDTI1MDkyMzIwMzEwMFoXDTQwMDkxOTIwMzEwMFowaDELMAkG
A1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQKEwtIeXBl
cmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMtY2Etc2Vy
dmVyMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJ7AzGi8JDQOeDIkHLRryzXab
KhW/tuC6Kwa5bT40xRqnezked+fC8don/vOCnhj3oSSEazXPYthGtcUnTPYB0KNF
MEMwDgYDVR0PAQH/BAQDAgEGMBIGA1UdEwEB/wQIMAYBAf8CAQEwHQYDVR0OBBYE
FN3P2zjgkNYD/DyyFFrjLmND74eHMAoGCCqGSM49BAMCA0gAMEUCIQDa6ZzRnCjB
bu79S01crzSNQGE5Szw8posBFKfElueECgIgF0fznJpDXyL0nigFUmVFQSRRKcoI
zXQLNrPK6jgyUuU=
-----END CERTIFICATE-----`
            },
            grpcOptions: {
              'ssl-target-name-override': 'peer0-greenstand',
              'grpc.ssl_target_name_override': 'peer0-greenstand'
            }
          },
          'peer0-cbo': {
            url: 'grpcs://peer0-cbo.hlf-peer-org.svc.cluster.local:7051',
            tlsCACerts: {
              pem: `-----BEGIN CERTIFICATE-----
MIICFzCCAb2gAwIBAgIUev7ke/x3sNpeLyBdtjw4xEa1h+8wCgYIKoZIzj0EAwIw
aDELMAkGA1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQK
EwtIeXBlcmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMt
Y2Etc2VydmVyMB4XDTI1MDkyMzIwNTYwMFoXDTQwMDkxOTIwNTYwMFowaDELMAkG
A1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQKEwtIeXBl
cmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMtY2Etc2Vy
dmVyMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEyYV3L/VZJ2eGWubr5iC1MDST
L6IPF3bmsblv5VnmArLqeTnDLLLsAagKgi5kWiZG6n7NOowokAgnW2Kp/1DkA6NF
MEMwDgYDVR0PAQH/BAQDAgEGMBIGA1UdEwEB/wQIMAYBAf8CAQEwHQYDVR0OBBYE
FO0b2Y5rjSa0RGfAr0vyaNDHM+8zMAoGCCqGSM49BAMCA0gAMEUCIQCgl/63senS
S7XOTbj83GTSYRaylkLjG/j3OnMhlY7vPwIgAlHV9j35KrN5XPfP9OPMUUd6SGYQ
7I5iqvr2hg1BLzY=
-----END CERTIFICATE-----`
            },
            grpcOptions: {
              'ssl-target-name-override': 'peer0-cbo',
              'grpc.ssl_target_name_override': 'peer0-cbo'
            }
          },
          'peer0-investor': {
            url: 'grpcs://peer0-investor.hlf-peer-org.svc.cluster.local:7051',
            tlsCACerts: {
              pem: `-----BEGIN CERTIFICATE-----
MIICFzCCAb2gAwIBAgIULdusG8a0gXdXNswjwf6bcCyNHsMwCgYIKoZIzj0EAwIw
aDELMAkGA1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQK
EwtIeXBlcmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMt
Y2Etc2VydmVyMB4XDTI1MDkyMzIwNTYwMFoXDTQwMDkxOTIwNTYwMFowaDELMAkG
A1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQKEwtIeXBl
cmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMtY2Etc2Vy
dmVyMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEu6MbOfok9pB3PllNqsSs9ecx
HkNPWJUgm00AxzK+rBKTbaSOwxE9YrFVa22fZX32imoHqhZ4QlRqQFA3Ox+MgKNF
MEMwDgYDVR0PAQH/BAQDAgEGMBIGA1UdEwEB/wQIMAYBAf8CAQEwHQYDVR0OBBYE
FBGSvWm42VKb8eZ/Ju8RzN4ZD0AEMAoGCCqGSM49BAMCA0gAMEUCIQDQ6c9Ilh16
llppjF3Y70ud9+ShY3eR+ZA/1WSOCDut9gIgCuqLfegS+p14X8ir/4Y8SIBHEqov
F+zKMRHuWn+E1DU=
-----END CERTIFICATE-----`
            },
            grpcOptions: {
              'ssl-target-name-override': 'peer0-investor',
              'grpc.ssl_target_name_override': 'peer0-investor'
            }
          },
          'peer0-verifier': {
            url: 'grpcs://peer0-verifier.hlf-peer-org.svc.cluster.local:7051',
            tlsCACerts: {
              pem: `-----BEGIN CERTIFICATE-----
MIICFzCCAb2gAwIBAgIUT5lsyjWJIU8x26h7pguvGze8OYUwCgYIKoZIzj0EAwIw
aDELMAkGA1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQK
EwtIeXBlcmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMt
Y2Etc2VydmVyMB4XDTI1MDkyMzIwNTYwMFoXDTQwMDkxOTIwNTYwMFowaDELMAkG
A1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRQwEgYDVQQKEwtIeXBl
cmxlZGdlcjEPMA0GA1UECxMGRmFicmljMRkwFwYDVQQDExBmYWJyaWMtY2Etc2Vy
dmVyMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEk6Nu+NbtUw1TDSDL1u/lGsYU
Ps5HtdR803U4l6GFP2fxLCocqlFCzijzcywEM5heGtKApOFK/YRZs07MVDNfs6NF
MEMwDgYDVR0PAQH/BAQDAgEGMBIGA1UdEwEB/wQIMAYBAf8CAQEwHQYDVR0OBBYE
FD0ltsiwKNpjYO9ISimN3QN0tiwTMAoGCCqGSM49BAMCA0gAMEUCIQDGVw5YX9iN
CJ4jQPM79fY5TuqB5ts1X0YPJnae2H4qbAIgD/jo1PJUf5iTyuxmnqZWP/RZ9Mfi
/RlHG+anhprmz04=
-----END CERTIFICATE-----`
            },
            grpcOptions: {
              'ssl-target-name-override': 'peer0-verifier',
              'grpc.ssl_target_name_override': 'peer0-verifier'
            }
          }
        }
      };

      await this.gateway.connect(connectionProfile, {
        wallet: this.wallet!,
        identity: username,
        discovery: { enabled: false, asLocalhost: false }
      });

      this.network = await this.gateway.getNetwork(this.channelName);
      // Use explicit contract name for Go contract API
      try {
        this.contract = this.network.getContract(this.chaincodeName, 'TreeContract');
      } catch (e) {
        // Fallback to default contract if namespacing is not used
        this.contract = this.network.getContract(this.chaincodeName);
      }

      console.log('Successfully connected to Fabric network');
    } catch (error) {
      console.error('Failed to connect to Fabric network:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.gateway) {
      await this.gateway.disconnect();
      this.gateway = null;
      this.network = null;
      this.contract = null;
    }
  }

  public getContract(): Contract {
    if (!this.contract) {
      throw new Error('Fabric contract not initialized');
    }
    return this.contract;
  }

  public async submitCaptureTransaction(captureData: CaptureData): Promise<{ txId: string; treeId?: string }> {
    if (!this.contract) {
      throw new Error('Not connected to Fabric network');
    }

    try {
      const transaction = this.contract.createTransaction('PlantTree');
      const request = {
        species: captureData.species || 'Unknown',
        location: {
          latitude: captureData.latitude,
          longitude: captureData.longitude,
          accuracy: captureData.gpsAccuracy || 0
        },
        plantingDate: Math.floor(captureData.timestamp.getTime() / 1000),
        metadata: {
          imageUrl: captureData.imageUrl || '',
          deviceId: captureData.deviceId || '',
          note: captureData.note || '',
          userId: captureData.userId,
          commonName: captureData.commonName || captureData.species || ''
        }
      };
      const result = await transaction.submit(JSON.stringify(request));

      const txId = transaction.getTransactionId();
      let treeId: string | undefined;
      try {
        const tree = JSON.parse(result.toString());
        if (tree?.id) {
          treeId = tree.id;
        }
      } catch (error) {
        console.warn('Failed to parse chaincode response:', error);
      }

      console.log(`Transaction submitted successfully: ${txId}`);
      
      return { txId, treeId };
    } catch (error) {
      console.error('Failed to submit capture transaction:', error);
      throw error;
    }
  }

  public async queryCapture(captureId: string): Promise<CaptureData | null> {
    if (!this.contract) {
      throw new Error('Not connected to Fabric network');
    }

    try {
      const result = await this.contract.evaluateTransaction('queryCapture', captureId);
      const captureData = JSON.parse(result.toString());
      return captureData;
    } catch (error) {
      console.error('Failed to query capture:', error);
      return null;
    }
  }

  public async queryCapturesByUser(userId: string): Promise<CaptureData[]> {
    if (!this.contract) {
      throw new Error('Not connected to Fabric network');
    }

    try {
      const result = await this.contract.evaluateTransaction('queryCapturesByUser', userId);
      const captures = JSON.parse(result.toString());
      return captures;
    } catch (error) {
      console.error('Failed to query captures by user:', error);
      return [];
    }
  }

  public async updateCaptureStatus(captureId: string, approved: boolean): Promise<string> {
    if (!this.contract) {
      throw new Error('Not connected to Fabric network');
    }

    try {
      const transaction = this.contract.createTransaction('updateCaptureStatus');
      await transaction.submit(captureId, approved.toString());
      
      const txId = transaction.getTransactionId();
      console.log(`Capture status updated: ${txId}`);
      
      return txId;
    } catch (error) {
      console.error('Failed to update capture status:', error);
      throw error;
    }
  }

  public async getCaptureHistory(captureId: string): Promise<FabricTransaction[]> {
    if (!this.contract) {
      throw new Error('Not connected to Fabric network');
    }

    try {
      const result = await this.contract.evaluateTransaction('getCaptureHistory', captureId);
      const history = JSON.parse(result.toString());
      return history;
    } catch (error) {
      console.error('Failed to get capture history:', error);
      return [];
    }
  }
}

export default FabricClient;
