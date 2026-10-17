import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function main() {
  // Request bodies are never logged: they carry journal and letter text (PRD N-09).
  const app = configureApp(await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] }));
  if (process.env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Solace API').setVersion('v1').addBearerAuth().build());
    SwaggerModule.setup('docs', app, doc);
  }
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API listening on :${port}`, 'Bootstrap');
}

void main();
