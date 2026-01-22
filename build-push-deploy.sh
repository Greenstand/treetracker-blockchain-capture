#!/bin/bash

# Complete Build, Push, and Deploy workflow for Treetracker Capture Service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
IMAGE_TAG="${1:-latest}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
VERSIONED_TAG="${TIMESTAMP}"

print_info "🚀 Starting complete deployment workflow for Treetracker Capture Service"
echo "📋 Configuration:"
echo "   Image Tag: ${IMAGE_TAG}"
echo "   Versioned Tag: ${VERSIONED_TAG}"
echo "   Namespace: treetracker-webapp-mvp"
echo ""

# Ask for confirmation
if [ "${IMAGE_TAG}" == "latest" ]; then
    read -p "Deploy with latest tag? This will create a versioned tag (${VERSIONED_TAG}) as well. (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deployment cancelled"
        exit 0
    fi
fi

# Step 1: Build and Push Docker Image
print_info "📦 Step 1: Building and pushing Docker image..."
./build-and-push.sh ${IMAGE_TAG}

if [ $? -eq 0 ]; then
    print_status "Docker image build and push completed"
else
    print_error "Failed to build and push Docker image"
    exit 1
fi

# Step 2: Create versioned tag if using latest
if [ "${IMAGE_TAG}" == "latest" ]; then
    print_info "📦 Creating versioned tag: ${VERSIONED_TAG}"
    ./build-and-push.sh ${VERSIONED_TAG}
fi

# Step 3: Deploy to Kubernetes
print_info "🚀 Step 2: Deploying to Kubernetes..."
./deploy.sh ${IMAGE_TAG}

if [ $? -eq 0 ]; then
    print_status "Kubernetes deployment completed"
else
    print_error "Failed to deploy to Kubernetes"
    exit 1
fi

# Step 4: Verify Deployment
print_info "✅ Step 3: Verifying deployment..."
NAMESPACE="treetracker-webapp-mvp"
SERVICE_NAME="treetracker-capture-service"

# Wait a bit for pods to be ready
sleep 10

# Check pod status
PODS_READY=$(kubectl get pods -l app=${SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | tr ' ' '\n' | grep -c "True" || echo "0")
TOTAL_PODS=$(kubectl get pods -l app=${SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.items[*].metadata.name}' | wc -w)

print_info "Pod Status: ${PODS_READY}/${TOTAL_PODS} pods ready"

if [ "${PODS_READY}" -gt "0" ]; then
    print_status "✅ Deployment verification successful"
    
    # Get service endpoint
    SERVICE_IP=$(kubectl get service ${SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.clusterIP}')
    SERVICE_PORT=$(kubectl get service ${SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.ports[0].port}')
    
    print_info "🌐 Service Details:"
    echo "   Internal Service: ${SERVICE_IP}:${SERVICE_PORT}"
    echo "   Service Name: ${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:${SERVICE_PORT}"
    
    # Check if there's an ingress
    if kubectl get ingress ${SERVICE_NAME} -n ${NAMESPACE} &> /dev/null; then
        INGRESS_HOST=$(kubectl get ingress ${SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.rules[0].host}')
        print_info "   External Access: https://${INGRESS_HOST}"
    fi
    
    print_info "🔗 Integration URLs for Web App:"
    echo "   CAPTURE_SERVICE_URL: http://${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:${SERVICE_PORT}/api/captures"
    echo "   VALIDATION_URL: http://${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:${SERVICE_PORT}/api/captures/validate"
    echo "   SPECIES_URL: http://${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:${SERVICE_PORT}/api/captures/species/suggest"
    
else
    print_warning "⚠️  Some pods are not ready yet. Check the status:"
    kubectl get pods -l app=${SERVICE_NAME} -n ${NAMESPACE}
    print_info "View logs with: kubectl logs -f deployment/${SERVICE_NAME} -n ${NAMESPACE}"
fi

# Step 5: Integration Test (if possible)
print_info "🧪 Step 4: Running basic integration test..."

# Port forward for testing
kubectl port-forward service/${SERVICE_NAME} 9090:${SERVICE_PORT} -n ${NAMESPACE} &
PORT_FORWARD_PID=$!
sleep 3

# Test health endpoint
if curl -f http://localhost:9090/health &> /dev/null; then
    print_status "✅ Health check passed"
    
    # Test API endpoint structure
    HEALTH_RESPONSE=$(curl -s http://localhost:9090/health)
    if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
        print_status "✅ API is responding correctly"
    else
        print_warning "⚠️  API health response unexpected: $HEALTH_RESPONSE"
    fi
else
    print_warning "⚠️  Health check failed - service may still be starting"
fi

# Kill port forward
kill $PORT_FORWARD_PID 2>/dev/null || true

# Display final summary
echo ""
print_status "🎉 Deployment workflow completed!"
echo ""
print_info "📊 Summary:"
echo "   ✅ Docker image built and pushed"
echo "   ✅ Kubernetes manifests applied"
echo "   ✅ Service deployed to ${NAMESPACE} namespace"
echo "   ✅ Basic integration test completed"
echo ""
print_info "📋 Deployment Tags:"
echo "   Primary: ${IMAGE_TAG}"
if [ "${IMAGE_TAG}" == "latest" ]; then
echo "   Versioned: ${VERSIONED_TAG}"
fi
echo ""
print_info "🔧 Useful Commands:"
echo "   View logs: kubectl logs -f deployment/${SERVICE_NAME} -n ${NAMESPACE}"
echo "   Check status: kubectl get all -l app=${SERVICE_NAME} -n ${NAMESPACE}"
echo "   Port forward: kubectl port-forward service/${SERVICE_NAME} 3002:${SERVICE_PORT} -n ${NAMESPACE}"
echo "   Scale up: kubectl scale deployment ${SERVICE_NAME} --replicas=3 -n ${NAMESPACE}"
echo "   Rollback: kubectl rollout undo deployment/${SERVICE_NAME} -n ${NAMESPACE}"
echo ""
print_info "🎯 Next Steps:"
echo "1. Update your web application to use the capture service endpoints"
echo "2. Configure ingress rules for external access"
echo "3. Set up monitoring and alerting"
echo "4. Test the complete user workflow"

# Save deployment info to file
cat > deployment-info.txt << EOF
Treetracker Capture Service Deployment
======================================
Timestamp: $(date)
Image Tag: ${IMAGE_TAG}
Versioned Tag: ${VERSIONED_TAG}
Namespace: ${NAMESPACE}
Service Name: ${SERVICE_NAME}

Service Endpoints:
- Internal: ${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:${SERVICE_PORT}
- Health Check: http://${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:${SERVICE_PORT}/health
- API Base: http://${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local:${SERVICE_PORT}/api/captures

Kubectl Commands:
- Logs: kubectl logs -f deployment/${SERVICE_NAME} -n ${NAMESPACE}
- Status: kubectl get all -l app=${SERVICE_NAME} -n ${NAMESPACE}
- Port Forward: kubectl port-forward service/${SERVICE_NAME} 3002:${SERVICE_PORT} -n ${NAMESPACE}
EOF

print_info "📄 Deployment information saved to: deployment-info.txt"