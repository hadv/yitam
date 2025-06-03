# Deploying YITAM to k0s Kubernetes

This guide explains how to deploy the YITAM application to a k0s Kubernetes cluster.

## Prerequisites

- k0s cluster set up and running
- kubectl configured to connect to your k0s cluster
- Docker images for yitam-mcp, yitam-server, and yitam-client built and available

## Setup Steps

### 1. Install k0s (if not already installed)

```bash
curl -sSLf https://get.k0s.sh | sudo sh
sudo k0s install controller --single
sudo k0s start
```

Wait for the cluster to initialize, then get the kubeconfig:

```bash
sudo k0s kubeconfig admin > ~/.kube/config
chmod 600 ~/.kube/config
```

### 2. Build and Load Docker Images

Build your Docker images as usual:

```bash
# Build MCP image
cd ../yitam-mcp
docker build -t yitam-mcp:latest .

# Build Server image
cd ../server
docker build -t yitam-server:latest .

# Build Client image
cd ../client
docker build -t yitam-client:latest .
```

For a single-node k0s cluster, you can use the images directly. For a multi-node cluster, you'll need to push these images to a container registry.

### 3. Update Configuration Files

1. Update `secrets.yaml` with your actual secrets (encoded in base64)
2. Update `ssl-secrets.yaml` with your actual SSL certificates (encoded in base64)
3. Update `nginx-configmap.yaml` with your actual nginx configuration
4. Modify the number of replicas in deployment files as needed

### 4. Apply the Kubernetes Manifests

```bash
kubectl apply -k .
```

Or apply each file individually:

```bash
kubectl apply -f namespace.yaml
kubectl apply -f persistent-volume.yaml
# ... apply all other files
```

### 5. Verify Deployment

```bash
kubectl get all -n yitam
kubectl get ingress -n yitam
```

## SSL Certificate Management

For production, consider using cert-manager to automatically manage your SSL certificates:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.3/cert-manager.yaml

# Create an issuer and certificate resources
# (Sample files not included - refer to cert-manager documentation)
```

## Monitoring and Troubleshooting

```bash
# Check pod status
kubectl get pods -n yitam

# View logs for a specific pod
kubectl logs -n yitam <pod-name>

# Describe resources for troubleshooting
kubectl describe pod -n yitam <pod-name>
``` 