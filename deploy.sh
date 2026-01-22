#!/bin/bash

# Deploy Treetracker Capture Service to Kubernetes

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
NAMESPACE="treetracker-webapp-mvp"
SERVICE_NAME="treetracker-capture-service"
IMAGE_TAG="${1:-latest}"

print_info "🚀 Deploying ${SERVICE_NAME} to Kubernetes namespace: ${NAMESPACE}"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed or not available"
    exit 1
fi

# Check if namespace exists
if ! kubectl get namespace ${NAMESPACE} &> /dev/null; then
    print_error "Namespace '${NAMESPACE}' does not exist"
    print_info "Creating namespace..."
    kubectl create namespace ${NAMESPACE}
    print_status "Created namespace: ${NAMESPACE}"
fi

# Verify kubectl context
print_info "Current kubectl context:"
kubectl config current-context

# Apply ConfigMap
print_info "Applying ConfigMap..."
kubectl apply -f k8s/configmap.yaml -n ${NAMESPACE}
print_status "ConfigMap applied"

# Apply Secret
print_info "Applying Secret..."
kubectl apply -f k8s/secret.yaml -n ${NAMESPACE}
print_status "Secret applied"

# Check if image pull secret exists
if ! kubectl get secret treetracker-registry -n ${NAMESPACE} &> /dev/null; then
    print_warning "Image pull secret 'treetracker-registry' not found"
    print_info "Creating DigitalOcean registry secret..."
    
    # Try to create the secret using doctl if available
    if command -v doctl &> /dev/null; then
        doctl registry kubernetes-manifest | kubectl apply -f - -n ${NAMESPACE}
        print_status "DigitalOcean registry secret created"
    else
        print_warning "doctl not available. Please create the registry secret manually:"
        echo "kubectl create secret docker-registry treetracker-registry \\"
        echo "  --docker-server=registry.digitalocean.com \\"
        echo "  --docker-username=<your-do-token> \\"
        echo "  --docker-password=<your-do-token> \\"
        echo "  --namespace=${NAMESPACE}"
        read -p "Press enter after creating the secret..."
    fi
fi

# Update image tag if specified
if [ "${IMAGE_TAG}" != "latest" ]; then
    print_info "Updating deployment image tag to: ${IMAGE_TAG}"
    sed -i.bak "s|:latest|:${IMAGE_TAG}|g" k8s/deployment.yaml
fi

# Apply Deployment
print_info "Applying Deployment..."
kubectl apply -f k8s/deployment.yaml -n ${NAMESPACE}
print_status "Deployment applied"

# Restore original file if we modified it
if [ "${IMAGE_TAG}" != "latest" ] && [ -f "k8s/deployment.yaml.bak" ]; then
    mv k8s/deployment.yaml.bak k8s/deployment.yaml
fi

# Wait for deployment to be ready
print_info "Waiting for deployment to be ready..."
kubectl rollout status deployment/${SERVICE_NAME} -n ${NAMESPACE} --timeout=300s

if [ $? -eq 0 ]; then
    print_status "Deployment is ready!"
else
    print_error "Deployment failed or timed out"
    print_info "Checking pod status..."
    kubectl get pods -l app=${SERVICE_NAME} -n ${NAMESPACE}
    print_info "Recent events:"
    kubectl get events -n ${NAMESPACE} --sort-by='.lastTimestamp' | tail -10
    exit 1
fi

# Display deployment information
print_info "📋 Deployment Information:"
echo ""

# Get pod information
print_info "Pods:"
kubectl get pods -l app=${SERVICE_NAME} -n ${NAMESPACE} -o wide

echo ""

# Get service information
print_info "Service:"
kubectl get service ${SERVICE_NAME} -n ${NAMESPACE}

echo ""

# Get ingress information if exists
if kubectl get ingress ${SERVICE_NAME} -n ${NAMESPACE} &> /dev/null; then
    print_info "Ingress:"
    kubectl get ingress ${SERVICE_NAME} -n ${NAMESPACE}
    echo ""
fi

# Check service health
print_info "Checking service health..."
SERVICE_IP=$(kubectl get service ${SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.clusterIP}')
SERVICE_PORT=$(kubectl get service ${SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.ports[0].port}')

# Port forward for health check
print_info "Testing service connectivity..."
kubectl port-forward service/${SERVICE_NAME} 8080:${SERVICE_PORT} -n ${NAMESPACE} &
PORT_FORWARD_PID=$!
sleep 5

if curl -f http://localhost:8080/health &> /dev/null; then
    print_status "Service is healthy and responding"
else
    print_warning "Service might still be starting up"
fi

# Kill port forward
kill $PORT_FORWARD_PID 2>/dev/null || true

# Display useful commands
print_info "📚 Useful Commands:"
echo "   View logs: kubectl logs -f deployment/${SERVICE_NAME} -n ${NAMESPACE}"
echo "   Check status: kubectl get pods -l app=${SERVICE_NAME} -n ${NAMESPACE}"
echo "   Port forward: kubectl port-forward service/${SERVICE_NAME} 3002:${SERVICE_PORT} -n ${NAMESPACE}"
echo "   Delete deployment: kubectl delete -f k8s/ -n ${NAMESPACE}"
echo "   Scale deployment: kubectl scale deployment ${SERVICE_NAME} --replicas=3 -n ${NAMESPACE}"

print_status "🎉 Deployment completed successfully!"

# Show next steps
print_info "🎯 Next Steps:"
echo "1. Update your web app configuration to point to the capture service"
echo "2. Test the integration with your frontend application"
echo "3. Configure ingress rules for external access if needed"
echo "4. Set up monitoring and alerting for the service"