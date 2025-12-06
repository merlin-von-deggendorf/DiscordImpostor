import 'dotenv/config';
import 'reflect-metadata';
import { AppDataSource } from './data-source';

async function main() {
  await AppDataSource.initialize();
  console.log('DataSource initialized');

  // your backend logic here (CLI, jobs, RPC, whatever)
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
