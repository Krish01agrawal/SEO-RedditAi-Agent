import fs from 'fs';

export function getRandomComment(): string {
  const comments = fs.readFileSync('./data/comments.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  return comments[Math.floor(Math.random() * comments.length)];
} 