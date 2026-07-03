import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Agentic Dev Kit API')
    .setDescription('Auth, tasks, and AI (copilot/speech) endpoints.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // nestjs-zod: converts zod JSON schema output into clean OpenAPI 3.0 shapes
  // (orval consumes 3.0 best).
  return cleanupOpenApiDoc(document, { version: '3.0' });
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, () => buildOpenApiDocument(app));
}
