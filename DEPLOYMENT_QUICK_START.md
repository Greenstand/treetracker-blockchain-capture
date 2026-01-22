# 🚀 Treetracker Capture Service - Quick Deployment Guide

## 📋 **Prerequisites**

- ✅ Docker installed and running
- ✅ kubectl configured for your cluster
- ✅ DigitalOcean Container Registry access
- ✅ `treetracker-webapp-mvp` namespace exists

## 🎯 **One-Command Deployment**

```bash
./build-push-deploy.sh
```

This will:
1. Build Docker image
2. Push to DigitalOcean registry
3. Deploy to Kubernetes
4. Verify deployment
5. Run basic health checks

## 📦 **Individual Commands**

### **Build & Push Only**
```bash
./build-and-push.sh [tag]
```

### **Deploy Only**
```bash
./deploy.sh [tag]
```

### **With Custom Tag**
```bash
./build-push-deploy.sh v1.2.3
```

## 🔍 **Quick Status Checks**

```bash
# Check pod status
kubectl get pods -l app=treetracker-capture-service -n treetracker-webapp-mvp

# View logs
kubectl logs -f deployment/treetracker-capture-service -n treetracker-webapp-mvp

# Check service
kubectl get service treetracker-capture-service -n treetracker-webapp-mvp

# Port forward for testing
kubectl port-forward service/treetracker-capture-service 3002:3002 -n treetracker-webapp-mvp
```

## 🏥 **Health Check**

After deployment, test the service:

```bash
# If port forwarding
curl http://localhost:3002/health

# Response should be:
# {"status":"healthy","timestamp":"...","service":"treetracker-capture-service"}
```

## 🔧 **Service Endpoints**

Once deployed, the service will be available at:

- **Internal Cluster**: `treetracker-capture-service.treetracker-webapp-mvp.svc.cluster.local:3002`
- **API Base**: `/api/captures`
- **Health Check**: `/health`
- **Species Suggestions**: `/api/captures/species/suggest`
- **Validation**: `/api/captures/validate`

## 🌐 **Integration with Web App**

Update your web app environment variables:

```bash
NEXT_PUBLIC_CAPTURE_SERVICE_URL=http://treetracker-capture-service.treetracker-webapp-mvp.svc.cluster.local:3002/api/captures
NEXT_PUBLIC_CAPTURE_SERVICE_VALIDATION_URL=http://treetracker-capture-service.treetracker-webapp-mvp.svc.cluster.local:3002/api/captures/validate
NEXT_PUBLIC_CAPTURE_SERVICE_SPECIES_URL=http://treetracker-capture-service.treetracker-webapp-mvp.svc.cluster.local:3002/api/captures/species/suggest
```

## 🚨 **Troubleshooting**

### **Image Pull Errors**
```bash
# Create registry secret if missing
doctl registry kubernetes-manifest | kubectl apply -f - -n treetracker-webapp-mvp
```

### **Pod CrashLoopBackOff**
```bash
# Check logs
kubectl logs -f deployment/treetracker-capture-service -n treetracker-webapp-mvp

# Check events
kubectl get events -n treetracker-webapp-mvp --sort-by='.lastTimestamp'
```

### **Service Not Responding**
```bash
# Restart deployment
kubectl rollout restart deployment/treetracker-capture-service -n treetracker-webapp-mvp

# Check service endpoints
kubectl get endpoints treetracker-capture-service -n treetracker-webapp-mvp
```

### **Fabric Connection Issues**
```bash
# Check if CA service is accessible
kubectl exec -it deployment/treetracker-capture-service -n treetracker-webapp-mvp -- curl -k http://greenstand-ca-service.hlf-ca.svc.cluster.local:7058
```

## 🔄 **Common Operations**

### **Scale Service**
```bash
kubectl scale deployment treetracker-capture-service --replicas=3 -n treetracker-webapp-mvp
```

### **Update Configuration**
```bash
# Edit ConfigMap
kubectl edit configmap capture-service-config -n treetracker-webapp-mvp

# Restart pods to pick up changes
kubectl rollout restart deployment/treetracker-capture-service -n treetracker-webapp-mvp
```

### **Rollback Deployment**
```bash
kubectl rollout undo deployment/treetracker-capture-service -n treetracker-webapp-mvp
```

### **Delete Service**
```bash
kubectl delete -f k8s/ -n treetracker-webapp-mvp
```

## 📊 **Resource Usage**

Default resource allocation:
- **Requests**: 512Mi RAM, 250m CPU
- **Limits**: 1Gi RAM, 500m CPU
- **Storage**: 10Gi uploads, 1Gi wallet

Adjust in `k8s/deployment.yaml` if needed.

## 🎯 **Success Indicators**

✅ All checks should pass:
- [ ] Docker image builds successfully
- [ ] Image pushes to registry
- [ ] Pods reach Running state
- [ ] Health endpoint returns 200
- [ ] Service has valid endpoints
- [ ] Can connect to Keycloak
- [ ] Can connect to Fabric network

## 📞 **Support**

If deployment fails:
1. Check the logs with `kubectl logs`
2. Verify all prerequisites are met
3. Ensure network policies allow traffic
4. Check if required services (Keycloak, Fabric) are running