import mongoose from 'mongoose';
import app from './app.js';
import { environment } from './env.js';

function startupErrorMessage(error: unknown) {
  if (error instanceof Error && /querySrv|ECONNREFUSED|ETIMEOUT|ENOTFOUND/i.test(error.message)) {
    return 'MongoDB DNS lookup failed. Check your active DNS, VPN, firewall, or network connection.';
  }

  if (error instanceof Error && /MONGODB_URI|SESSION_SECRET|PORT/.test(error.message)) {
    return error.message;
  }

  return 'MongoDB connection failed. Check Atlas Network Access, cluster availability, and your network connection.';
}

async function start() {
  await mongoose.connect(environment.mongoDbUri, { serverSelectionTimeoutMS: 10_000 });
  console.log('MongoDB connected successfully');

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(environment.port, '0.0.0.0');
    server.once('listening', () => {
      console.log(`AI Mystery Room API listening on ${environment.port}`);
      resolve();
    });
    server.once('error', reject);
  });
}

start().catch((error: unknown) => {
  console.error(`Server startup failed: ${startupErrorMessage(error)}`);
  process.exitCode = 1;
});
