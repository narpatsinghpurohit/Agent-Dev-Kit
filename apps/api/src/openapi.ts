import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Agentic Dev Kit API')
    .setDescription('Auth, patients, consultations, and AI (copilot/voice) endpoints.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    // Clean operationIds → clean generated hook names (useTasksList, not
    // useTasksControllerList).
    operationIdFactory: (controllerKey, methodKey) => {
      const prefix = controllerKey.replace(/Controller$/, '');
      const camelPrefix = prefix.charAt(0).toLowerCase() + prefix.slice(1);
      if (methodKey.toLowerCase().startsWith(camelPrefix.toLowerCase())) return methodKey;
      return `${camelPrefix}${methodKey.charAt(0).toUpperCase()}${methodKey.slice(1)}`;
    },
  });
  // nestjs-zod: converts zod JSON schema output into clean OpenAPI 3.0 shapes
  // (orval consumes 3.0 best).
  return cleanupOpenApiDoc(document, { version: '3.0' });
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, () => buildOpenApiDocument(app));
}
