import os from 'node:os';

const port = 4173;
const interfaces = os.networkInterfaces();

const addresses = Object.entries(interfaces)
  .flatMap(([name, entries = []]) =>
    entries
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .map((entry) => ({ name, address: entry.address })),
  );

if (addresses.length === 0) {
  console.log('共有できるIPv4アドレスが見つかりませんでした。');
  process.exit(0);
}

console.log('iPadで開くURL候補:');
for (const item of addresses) {
  console.log(`- ${item.name}: http://${item.address}:${port}`);
}
