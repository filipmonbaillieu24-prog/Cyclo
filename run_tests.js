const { spawnSync } = require('child_process');
const fs = require('fs');

console.log("Preparing package.json for testing...");
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const originalType = pkg.type || 'commonjs';

try {
  pkg.type = 'module';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2), 'utf8');
  
  console.log("Running Fase 5 validation script...");
  const result = spawnSync('node', ['verify_fase5.mjs'], { stdio: 'inherit' });
  
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  }
} catch (err) {
  console.error("Test execution failed:", err);
  process.exitCode = 1;
} finally {
  console.log("Restoring package.json to original type...");
  pkg.type = originalType;
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2), 'utf8');
  console.log("package.json restored successfully.");
}
