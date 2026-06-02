import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { NormalizationPipe } from './common/pipes/normalization.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // 1. Enable global CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  app.enableCors({
    origin: corsOrigin.split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 2. Register global pipes
  // Note: NormalizationPipe runs first to format strings/phones, which then passes through ValidationPipe cleanly
  app.useGlobalPipes(
    new NormalizationPipe(),
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 3. Register global response format interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 4. Register global custom exception filter (prevents stack leaks, handles database errors)
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 5. Configure interactive OpenAPI Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MaroVarso API Services')
    .setDescription(
      'Complete and secure passwordless Mobile OTP authentication API endpoints for the MaroVarso workspace.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your Bearer Access Token',
        in: 'header',
      },
      'bearer', // This matches the security key referenced by @ApiBearerAuth()
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // 6. Bind listener port
  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);

  console.log(`\n┌────────────────────────────────────────────────────────┐`);
  console.log(`  🚀  MaroVarso Backend Server listening on Port ${port}      `);
  console.log(`  📝  Swagger Interactive Docs: http://localhost:${port}/api/docs  `);
  console.log(`└────────────────────────────────────────────────────────┘\n`);
}
bootstrap();
