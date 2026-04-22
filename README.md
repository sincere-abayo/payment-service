# MTN MoMo Disbursement Platform

A multi-tenant payment middleware for processing mobile money disbursements through MTN Mobile Money API.

## Features

- **Command-based API**: Single endpoint with command pattern for all operations
- **Multi-tenant architecture**: Support for multiple tenant applications
- **API key authentication**: Secure tenant authentication with API keys
- **Admin management**: Full admin panel for tenant and API key management
- **2FA support**: Two-factor authentication for admin accounts
- **BullMQ job queue**: Asynchronous disbursement processing
- **Webhook notifications**: Real-time batch completion notifications
- **Rate limiting**: Built-in throttling for API protection

## Tech Stack

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ with Redis
- **Authentication**: JWT and API keys
- **API Documentation**: Swagger/OpenAPI
- **Testing**: Jest

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose (for containerized deployment)
- Kubernetes (optional, for orchestration)

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Update `.env` with your configuration:

```env
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
COMMON_X_API_KEY=your_api_key_here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname?schema=public
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=dbname

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=8h

# MTN MoMo
MTN_BASE_URL=https://sandbox.momodeveloper.mtn.com
MTN_SUBSCRIPTION_KEY=your_subscription_key
MTN_API_USER=your_api_user
MTN_API_KEY=your_api_key
MTN_ENVIRONMENT=sandbox
MTN_CALLBACK_URL=http://localhost:3000/mtn-callback

# Seeding
RUN_SEED=true
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=StrongPassword123!
```

### 3. Setup Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate:dev

# Seed database
npm run prisma:seed
```

### 4. Start Development Server

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`
Swagger documentation at `http://localhost:3000/docs`

## Production Deployment

### Docker Compose (Recommended for VPS)

This project includes Docker Compose configuration for easy deployment on your VPS at `http://109.123.245.58:3030`.

#### 1. Prepare Environment

```bash
# Copy production environment template
cp .env.production .env

# Update .env with your production values
# IMPORTANT: Change all placeholder passwords and secrets!
```

#### 2. Build and Start Services

```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

#### 3. Access the Application

- **API**: `http://142.93.24.178:3009`
- **Swagger Docs**: `http://142.93.24.178:3009/docs`

#### 4. Docker Compose Services

The docker-compose.yml includes:

- **payment-service-app**: NestJS application (port 3009)
- **postgres**: PostgreSQL database (port 5432)
- **redis**: Redis for BullMQ (port 6379)

#### 5. Useful Commands

```bash
# View running containers
docker-compose ps

# Restart specific service
docker-compose restart app

# Rebuild specific service
docker-compose up -d --build app

# Execute commands in container
docker-compose exec app npm run prisma:migrate:deploy

# View application logs
docker-compose logs -f app

# View database logs
docker-compose logs -f postgres
```

### Kubernetes Deployment (Optional)

For Kubernetes orchestration, manifests are provided in the `k8s/` directory.

#### 1. Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

#### 2. Update Configuration

Edit `k8s/configmap.yaml` and `k8s/secret.yaml` with your production values:

```bash
# Edit config map
kubectl edit configmap payment-service-config -n payment-service

# Edit secrets
kubectl edit secret payment-service-secret -n payment-service
```

#### 3. Deploy Services

```bash
# Deploy PostgreSQL
kubectl apply -f k8s/postgres-pvc.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/postgres-service.yaml

# Deploy Redis
kubectl apply -f k8s/redis-pvc.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/redis-service.yaml

# Deploy Application
kubectl apply -f k8s/app-deployment.yaml
kubectl apply -f k8s/app-service.yaml
```

#### 4. Build and Push Docker Image

```bash
# Build image
docker build -t payment-service:latest .

# Tag for your registry
docker tag payment-service:latest your-registry/payment-service:latest

# Push to registry
docker push your-registry/payment-service:latest
```

#### 5. Verify Deployment

```bash
# Check pod status
kubectl get pods -n payment-service

# Check services
kubectl get services -n payment-service

# View logs
kubectl logs -f deployment/payment-service-app -n payment-service
```

#### 6. Access the Application

The service is exposed as NodePort. Find the assigned port:

```bash
kubectl get service payment-service-app -n payment-service
```

Access via: `http://109.123.245.58:<NODEPORT>`

## Environment Variables

| Variable               | Description                          | Default       |
| ---------------------- | ------------------------------------ | ------------- |
| `NODE_ENV`             | Environment (development/production) | `development` |
| `PORT`                 | Application port                     | `3000`        |
| `ALLOWED_ORIGINS`      | CORS allowed origins                 | `*`           |
| `COMMON_X_API_KEY`     | Common API key for all requests      | Required      |
| `DATABASE_URL`         | PostgreSQL connection string         | Required      |
| `REDIS_HOST`           | Redis host                           | `localhost`   |
| `REDIS_PORT`           | Redis port                           | `6379`        |
| `REDIS_PASSWORD`       | Redis password                       | Required      |
| `JWT_SECRET`           | JWT signing secret                   | Required      |
| `JWT_EXPIRES_IN`       | JWT expiration time                  | `8h`          |
| `MTN_BASE_URL`         | MTN API base URL                     | Required      |
| `MTN_SUBSCRIPTION_KEY` | MTN subscription key                 | Required      |
| `MTN_API_USER`         | MTN API user                         | Required      |
| `MTN_API_KEY`          | MTN API key                          | Required      |
| `MTN_ENVIRONMENT`      | MTN environment (sandbox/production) | `sandbox`     |
| `MTN_CALLBACK_URL`     | MTN callback URL                     | Required      |
| `RUN_SEED`             | Run database seed                    | `false`       |
| `ADMIN_EMAIL`          | Admin email for seeding              | Required      |
| `ADMIN_PASSWORD`       | Admin password for seeding           | Required      |

## API Documentation

- **Swagger UI**: Available at `/docs` (development only)
- **Postman Collection**: Located in `postman/` directory with comprehensive documentation

### Command Pattern

All requests use a single endpoint `POST /` with the `x-command` header to specify the operation:

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -H "x-command: ADM_LOGIN_1A2B" \
  -H "x-api-key: your_common_api_key" \
  -d '{"email": "admin@example.com", "password": "password"}'
```

## Project Structure

```
payment-service/
├── src/
│   ├── admin/          # Admin module commands
│   ├── auth/            # Authentication commands
│   ├── disbursement/    # Disbursement commands
│   ├── tenant/          # Tenant module commands
│   ├── common/          # Shared utilities
│   ├── master/          # Command dispatcher
│   └── main.ts          # Application entry point
├── prisma/              # Database schema and migrations
├── postman/             # Postman collection
├── scripts/             # Utility scripts
├── k8s/                 # Kubernetes manifests
├── Dockerfile           # Docker configuration
├── docker-compose.yml   # Docker Compose configuration
└── .env                 # Environment variables
```

## Database Migrations

```bash
# Create migration
npx prisma migrate dev --name migration_name

# Apply migrations (production)
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Open Prisma Studio
npx prisma studio
```

## Postman Collection

The Postman collection includes:

- Comprehensive request descriptions
- Response field documentation
- Error response examples
- Workflow examples
- Quick start guides

Import `postman/payment-service.postman_collection.json` into Postman.

## Security Considerations

1. **Change default passwords**: Update all passwords in production
2. **Use strong JWT secrets**: Minimum 32 characters, random
3. **Enable HTTPS**: Use reverse proxy (nginx) for SSL/TLS
4. **Rate limiting**: Configure appropriate throttle limits
5. **API key rotation**: Regularly rotate tenant API keys
6. **Database backups**: Implement regular backup strategy
7. **Environment variables**: Never commit `.env` files

## Monitoring

### Health Checks

- **Docker**: Built-in health check in Dockerfile
- **Kubernetes**: Liveness and readiness probes configured
- **Endpoint**: `GET /` returns 200 for healthy status

### Logs

```bash
# Docker Compose
docker-compose logs -f app

# Kubernetes
kubectl logs -f deployment/payment-service-app -n payment-service
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test connection
docker-compose exec app npx prisma db push
```

### Redis Connection Issues

```bash
# Check Redis is running
docker-compose ps redis

# Check Redis logs
docker-compose logs redis

# Test connection
docker-compose exec redis redis-cli ping
```

### Application Won't Start

```bash
# Check logs
docker-compose logs app

# Rebuild without cache
docker-compose build --no-cache app

# Check environment variables
docker-compose config
```

## License

Private project - All rights reserved

## Support

For issues and questions, refer to:

- `PAYMENT_SERVICE_DOCS.md` - Detailed API documentation
- `TENANT_APPLICATION_GUIDELINE.md` - Tenant integration guide
