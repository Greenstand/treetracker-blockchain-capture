# Treetracker Capture Service

A microservice for handling tree capture data with Keycloak authentication and Hyperledger Fabric blockchain integration.

## Features

- 🔐 **Keycloak Authentication**: JWT token validation and role-based access control
- 🌐 **Hyperledger Fabric Integration**: Blockchain transaction submission and querying
- 📸 **File Upload Support**: Image uploads with validation and storage
- 🏗️ **RESTful API**: Complete CRUD operations for tree captures
- 🐳 **Docker Support**: Full containerization with multi-stage builds
- ☸️ **Kubernetes Ready**: Production-ready deployment manifests
- 🔒 **Security**: Helmet middleware, CORS configuration, and input validation
- 📊 **Health Monitoring**: Health check endpoints and proper logging

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│  Capture Service │───▶│   Keycloak      │
│   (React)       │    │   (Node.js)      │    │   (Auth)        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Hyperledger      │
                       │ Fabric Network   │
                       │ (Blockchain)     │
                       └──────────────────┘
```

## API Endpoints

### Authentication
All endpoints (except `/health` and `/`) require a valid Keycloak JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| `GET` | `/health` | Health check | Public |
| `GET` | `/` | Service info | Public |
| `POST` | `/api/captures` | Create new capture | Private |
| `GET` | `/api/captures` | Get user's captures | Private |
| `GET` | `/api/captures/:id` | Get specific capture | Private |
| `PUT` | `/api/captures/:id/approve` | Approve/reject capture | Admin |
| `GET` | `/api/captures/:id/history` | Get blockchain history | Private |
| `DELETE` | `/api/captures/:id` | Delete capture | Private |
| `GET` | `/api/captures/species/suggest` | Get species suggestions by location | Private |
| `POST` | `/api/captures/validate` | Validate capture data without saving | Private |

### Request Examples

#### Create a comprehensive tree capture
```bash
curl -X POST http://localhost:3000/api/captures \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: multipart/form-data" \
  -F "latitude=37.7749" \
  -F "longitude=-122.4194" \
  -F "altitude=50" \
  -F "gpsAccuracy=5" \
  -F "commonName=White Oak" \
  -F "scientificName=Quercus alba" \
  -F "dbh=45.5" \
  -F "height=15.2" \
  -F "crownDiameter=12.0" \
  -F "treeAge=25" \
  -F "healthStatus=good" \
  -F "diseasePresent=false" \
  -F "pestDamage=false" \
  -F "structuralDamage=false" \
  -F "soilType=loamy" \
  -F "landUse=park" \
  -F "temperature=22" \
  -F "humidity=65" \
  -F "precipitation=none" \
  -F "plantingDate=2018-04-15" \
  -F "plantedBy=City Parks Dept" \
  -F "captureMethod=mobile_app" \
  -F "note=Healthy mature oak in central park" \
  -F "tags=oak,mature,healthy,urban" \
  -F "deviceId=mobile_001" \
  -F "image=@tree.jpg"
```

#### Get species suggestions
```bash
curl -X GET "http://localhost:3000/api/captures/species/suggest?latitude=37.7749&longitude=-122.4194" \
  -H "Authorization: Bearer <jwt_token>"
```

#### Validate capture data
```bash
curl -X POST http://localhost:3000/api/captures/validate \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 37.7749,
    "longitude": -122.4194,
    "dbh": 45.5,
    "height": 15.2,
    "commonName": "White Oak",
    "healthStatus": "good"
  }'
```

#### Get user's captures
```bash
curl -X GET "http://localhost:3000/api/captures?page=1&limit=10" \
  -H "Authorization: Bearer <jwt_token>"
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Keycloak Configuration
KEYCLOAK_SERVER_URL=http://localhost:8080
KEYCLOAK_REALM=treetracker
KEYCLOAK_CLIENT_ID=treetracker-capture-service

# Hyperledger Fabric Configuration
FABRIC_CA_URL=http://greenstand-ca-service.hlf-ca.svc.cluster.local:7058
FABRIC_PEER_URL=grpc://peer0-greenstand.hlf-peer-org.svc.cluster.local:7051
FABRIC_ORDERER_URL=grpc://orderer0.hlf-orderer.svc.cluster.local:7050
FABRIC_CHANNEL_NAME=treechannelv2
FABRIC_CHAINCODE_NAME=treetracker
FABRIC_MSP_ID=GreenstandMSP
FABRIC_ADMIN_USER=*********
FABRIC_ADMIN_PASSWORD=************

# File Upload Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp
```

## Development

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Access to Keycloak and Hyperledger Fabric network

### Local Development

1. **Clone and install dependencies**:
   ```bash
   cd /root/treetracker-capture-service
   npm install
   ```

2. **Copy environment configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run in development mode**:
   ```bash
   npm run dev
   ```

4. **Or use Docker Compose**:
   ```bash
   docker-compose up --build
   ```

### Building for Production

```bash
# Build TypeScript
npm run build

# Build Docker image
docker build -t treetracker-capture-service .

# Run production container
docker run -p 3000:3000 --env-file .env treetracker-capture-service
```

## Deployment

### Kubernetes Deployment

1. **Apply configuration**:
   ```bash
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/secret.yaml
   ```

2. **Deploy the service**:
   ```bash
   kubectl apply -f k8s/deployment.yaml
   ```

3. **Verify deployment**:
   ```bash
   kubectl get pods -n treetracker-webapp-mvp -l app=treetracker-capture-service
   kubectl logs -n treetracker-webapp-mvp deployment/treetracker-capture-service
   ```

### Docker Registry

Build and push to DigitalOcean Container Registry:

```bash
# Build for production
docker build -t treetracker-capture-service:latest .

# Push to registry
docker push treetracker-capture-service:latest
```

## Data Models

### CaptureData
```typescript
interface CaptureData {
  id: string;
  userId: string;
  
  // Geolocation data
  latitude: number;
  longitude: number;
  altitude?: number;              // Elevation in meters
  gpsAccuracy?: number;          // GPS accuracy in meters
  
  // Tree physical characteristics
  species?: string;
  commonName?: string;
  scientificName?: string;
  dbh?: number;                  // Diameter at Breast Height (cm)
  height?: number;               // Tree height in meters
  crownDiameter?: number;        // Crown diameter in meters
  treeAge?: number;              // Estimated age in years
  
  // Tree health and condition
  healthStatus?: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'dead';
  diseasePresent?: boolean;
  pestDamage?: boolean;
  structuralDamage?: boolean;
  
  // Environmental context
  soilType?: string;
  landUse?: 'forest' | 'urban' | 'agricultural' | 'park' | 'roadside' | 'residential' | 'commercial' | 'industrial';
  weather?: {
    temperature?: number;        // Celsius
    humidity?: number;           // Percentage
    precipitation?: 'none' | 'light' | 'moderate' | 'heavy';
  };
  
  // Planting/maintenance data
  plantingDate?: Date;
  plantedBy?: string;
  lastMaintenance?: Date;
  maintenanceType?: 'watering' | 'pruning' | 'fertilizing' | 'pest_treatment' | 'other';
  
  // Media and documentation
  imageUrl?: string;
  additionalImages?: string[];
  audioNote?: string;            // URL to audio recording
  
  // Metadata
  timestamp: Date;
  deviceId?: string;
  captureMethod?: 'mobile_app' | 'web_form' | 'field_survey' | 'drone' | 'satellite';
  note?: string;
  tags?: string[];              // User-defined tags
  
  // Administrative
  approved?: boolean;
  verifiedBy?: string;          // User ID of verifier
  verificationDate?: Date;
  carbonSequestrationEstimate?: number;  // kg CO2/year
  economicValue?: number;       // Currency value
  blockchainTxId?: string;
}
```

## Security

- **Authentication**: JWT tokens validated against Keycloak
- **Authorization**: Role-based access control (RBAC)
- **File Upload**: Type and size validation
- **CORS**: Configured for allowed origins
- **Helmet**: Security headers
- **Input Validation**: Request validation and sanitization

## Blockchain Integration

The service integrates with Hyperledger Fabric for immutable record keeping:

1. **User Enrollment**: Automatic user registration with Fabric CA
2. **Transaction Submission**: Tree captures stored on blockchain
3. **Query Operations**: Retrieve captures and transaction history
4. **Status Updates**: Admin approval/rejection recorded on blockchain

## Monitoring

- **Health Checks**: `/health` endpoint for liveness/readiness probes
- **Logging**: Structured logging with Morgan middleware
- **Error Handling**: Centralized error handling and reporting

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
