import { writeFile } from 'node:fs/promises';

/**
 * Writes a tiny country database in the MaxMind DB format, so the tests look
 * countries up through the real reader without shipping a licensed database.
 * Format: https://maxmind.github.io/MaxMind-DB/
 */

const RECORD_BYTES = 3;
const RECORD_BITS = RECORD_BYTES * 8;
const IPV4_BITS = 32;
const DATA_SEPARATOR_BYTES = 16;
const METADATA_MARKER = Buffer.concat([
  Buffer.from([0xab, 0xcd, 0xef]),
  Buffer.from('MaxMind.com'),
]);

/** Field types of the format's data section. */
const TYPE = { string: 2, uint16: 5, uint32: 6, map: 7, uint64: 9, array: 11 };
const EXTENDED_TYPE_OFFSET = 7;

function field(type: number, size: number, payload: Buffer): Buffer {
  const control =
    type > EXTENDED_TYPE_OFFSET
      ? Buffer.from([size, type - EXTENDED_TYPE_OFFSET])
      : Buffer.from([(type << 5) | size]);
  return Buffer.concat([control, payload]);
}

function text(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  return field(TYPE.string, bytes.length, bytes);
}

function unsigned(type: number, value: number): Buffer {
  const bytes: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest % 256);
  }
  return field(type, bytes.length, Buffer.from(bytes));
}

function map(entries: Array<[string, Buffer]>): Buffer {
  return field(
    TYPE.map,
    entries.length,
    Buffer.concat(entries.flatMap(([key, value]) => [text(key), value])),
  );
}

type Child = { node: number } | { data: number } | null;
type TreeNode = [Child, Child];

function addressBits(address: string, prefixLength: number): number[] {
  const bits = address
    .split('.')
    .flatMap((octet) =>
      Number(octet).toString(2).padStart(8, '0').split('').map(Number),
    );
  return bits.slice(0, prefixLength);
}

function insert(nodes: TreeNode[], bits: number[], data: number): void {
  let current = 0;
  bits.forEach((bit, depth) => {
    const node = nodes[current] as TreeNode;
    if (depth === bits.length - 1) {
      node[bit] = { data };
      return;
    }
    let child = node[bit] ?? null;
    if (child === null || !('node' in child)) {
      child = { node: nodes.push([null, null]) - 1 };
      node[bit] = child;
    }
    current = child.node;
  });
}

function record(child: Child, nodeCount: number): Buffer {
  let value = nodeCount;
  if (child !== null) {
    value =
      'node' in child
        ? child.node
        : nodeCount + DATA_SEPARATOR_BYTES + child.data;
  }
  const bytes = Buffer.alloc(RECORD_BYTES);
  bytes.writeUIntBE(value, 0, RECORD_BYTES);
  return bytes;
}

/**
 * Builds a database that maps each IPv4 network (`203.0.113.0/24`) to a
 * country code, and writes it to `path`.
 */
export async function writeCountryDatabase(
  path: string,
  networks: Readonly<Record<string, string>>,
): Promise<void> {
  const nodes: TreeNode[] = [[null, null]];
  const dataRecords: Buffer[] = [];
  let dataLength = 0;

  for (const [network, country] of Object.entries(networks)) {
    const [address = '', prefixLength = String(IPV4_BITS)] = network.split('/');
    const data = map([['country', map([['iso_code', text(country)]])]]);
    insert(nodes, addressBits(address, Number(prefixLength)), dataLength);
    dataRecords.push(data);
    dataLength += data.length;
  }

  const tree = nodes.flatMap(([left, right]) => [
    record(left, nodes.length),
    record(right, nodes.length),
  ]);
  const metadata = map([
    ['binary_format_major_version', unsigned(TYPE.uint16, 2)],
    ['binary_format_minor_version', unsigned(TYPE.uint16, 0)],
    ['build_epoch', unsigned(TYPE.uint64, 1_795_760_000)],
    ['database_type', text('Test-Country')],
    ['description', map([['en', text('Test country database')]])],
    ['ip_version', unsigned(TYPE.uint16, 4)],
    ['languages', field(TYPE.array, 1, text('en'))],
    ['node_count', unsigned(TYPE.uint32, nodes.length)],
    ['record_size', unsigned(TYPE.uint16, RECORD_BITS)],
  ]);

  await writeFile(
    path,
    Buffer.concat([
      ...tree,
      Buffer.alloc(DATA_SEPARATOR_BYTES),
      ...dataRecords,
      METADATA_MARKER,
      metadata,
    ]),
  );
}
