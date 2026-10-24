import { store } from './store.js';

export async function runSeed() {
  console.log('[Seed] Populating GoldenHour synthetic scenario store...');
  await store.seed();
  console.log('[Seed] Seeding completed successfully:');
  console.log(`  - Hospitals: ${store.listHospitals().length}`);
  console.log(`  - Resource Pools: ${store.resourcePools.size}`);
  console.log(`  - Staff Slots: ${store.staffAvailability.size}`);
  console.log(`  - Demo Users: ${store.users.size}`);
}

if (process.argv[1]?.includes('seed.ts')) {
  runSeed().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
