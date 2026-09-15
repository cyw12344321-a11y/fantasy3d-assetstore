const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const blenderExe = 'C:\\Users\\苏明恒\\Desktop\\blender-portable\\blender-4.2.3-windows-x64\\blender.exe';
const exportScript = 'C:\\Users\\苏明恒\\Desktop\\fantasy3d-store\\blender-export.py';
const inputDir = 'D:\\3DModels';
const outputDir = 'D:\\3DModels\\_preview';
const projectModelsDir = 'C:\\Users\\苏明恒\\Desktop\\fantasy3d-store\\frontend\\models';

const files = fs.readdirSync(inputDir).filter(f => f.toLowerCase().endsWith('.blend'));
console.log(`Found ${files.length} BLEND files`);
console.log(`Output: ${outputDir}`);
console.log('');

let success = 0, failed = 0, skipped = 0;

files.forEach((file, idx) => {
  const baseName = path.basename(file, '.blend');
  const glbName = baseName + '.glb';
  const outputPath = path.join(outputDir, glbName);
  const inputPath = path.join(inputDir, file);
  
  if (fs.existsSync(outputPath)) {
    skipped++;
    console.log(`[${idx+1}/${files.length}] SKIP: ${file}`);
    return;
  }
  
  console.log(`[${idx+1}/${files.length}] CONVERT: ${file}`);
  
  try {
    execFileSync(blenderExe, [
      '--background',
      inputPath,
      '--python',
      exportScript,
      '--',
      outputPath
    ], { timeout: 120000, stdio: 'pipe' });
    
    if (fs.existsSync(outputPath)) {
      success++;
      fs.copyFileSync(outputPath, path.join(projectModelsDir, glbName));
      console.log('  OK');
    } else {
      failed++;
      console.log('  FAIL (no output)');
    }
  } catch (e) {
    failed++;
    console.log(`  ERROR: ${e.message}`);
  }
});

console.log('');
console.log('=== DONE ===');
console.log(`Total: ${files.length}`);
console.log(`Success: ${success}`);
console.log(`Skipped: ${skipped}`);
console.log(`Failed: ${failed}`);
