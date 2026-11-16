import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = resolve('.');
const directory = join(root, 'docs/assets/demos');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
assert.equal(manifest.clips.length, 3);
assert.equal(manifest.source, 'isolated local app');
for (const clip of manifest.clips) {
  const file = join(directory, clip.file);
  const data = await readFile(file);
  assert.match(data.subarray(0, 6).toString(), /^GIF8[79]a$/);
  assert.ok(data.length < 5 * 1024 * 1024, `${clip.file} exceeds 5 MiB`);
  const metadata = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
  const stream = metadata.streams[0];
  assert.equal(stream.width, 840);
  assert.equal(stream.height, 750);
  assert.equal(Number(stream.nb_read_frames), clip.frames);
  assert.equal(data.length, clip.bytes);
  assert.ok(Number(metadata.format.duration) >= 7 && Number(metadata.format.duration) <= 16);
  assert.equal(Number(metadata.format.duration), clip.seconds);
  assert.ok(clip.frames > 1);
  assert.equal(clip.simulatedAI, clip.file === 'ai-lab.gif');
  execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: 'pipe' });
  for (const image of [clip.preview]) {
    const png = await readFile(join(directory, image));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), manifest.viewport.width);
    assert.ok(png.readUInt32BE(20) >= manifest.viewport.height);
  }
  console.log(`${clip.file}: fully decoded, ${clip.seconds}s, ${(clip.bytes / 1048576).toFixed(2)} MiB`);
}
const mobile = await readFile(join(directory, 'customization-mobile.png'));
assert.equal(mobile.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(mobile.readUInt32BE(16), 390);
assert.equal(mobile.readUInt32BE(20), 844);

let checked = 0;
for (const document of ['README.md', 'docs/development.md', 'docs/demos.md']) {
  const file = join(root, document);
  const text = await readFile(file, 'utf8');
  const targets = [...text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)].map(match => match[1]);
  targets.push(...[...text.matchAll(/<img\s[^>]*src="([^"]+)"/g)].map(match => match[1]));
  for (const target of targets) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const [path, fragment] = target.split('#');
    const absolute = resolve(dirname(file), decodeURIComponent(path));
    await stat(absolute);
    if (fragment && absolute.endsWith('.md')) {
      const content = await readFile(absolute, 'utf8');
      const slugs = [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => match[1].toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-'));
      assert.ok(slugs.includes(fragment), `Missing heading ${target} in ${document}`);
    }
    checked++;
  }
}
console.log(`Verified ${checked} relative documentation links, three GIFs and four PNG previews.`);
