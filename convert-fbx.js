// 批量FBX转GLB脚本
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODEL_DIR = 'D:\\3D模型';
const PREVIEW_DIR = 'D:\\3D模型\\_preview';

if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

// 查找fbx2gltf可执行文件
function findFbx2Gltf() {
  const possiblePaths = [
    path.join(__dirname, 'node_modules', 'fbx2gltf', 'bin', 'Windows_NT', 'FBX2glTF.exe'),
    path.join(__dirname, 'node_modules', 'fbx2gltf', 'bin', 'FBX2glTF.exe'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  // 尝试从npm包查找
  try {
    const pkgPath = require.resolve('fbx2gltf');
    const pkgDir = path.dirname(pkgPath);
    const binPath = path.join(pkgDir, 'bin', 'FBX2glTF.exe');
    if (fs.existsSync(binPath)) return binPath;
  } catch (e) {}
  return null;
}

const fbx2gltfPath = findFbx2Gltf();
if (!fbx2gltfPath) {
  console.error('❌ 找不到FBX2glTF可执行文件');
  console.log('node_modules/fbx2gltf目录内容:');
  try {
    console.log(fs.readdirSync(path.join(__dirname, 'node_modules', 'fbx2gltf')));
  } catch (e) {
    console.log('目录不存在');
  }
  process.exit(1);
}

console.log(`使用转换工具: ${fbx2gltfPath}`);

function convertFbxToGlb(inputPath, outputPath) {
  try {
    const outputDir = path.dirname(outputPath);
    const outputName = path.basename(outputPath, '.glb');
    execFileSync(fbx2gltfPath, [
      '-i', inputPath,
      '-o', path.join(outputDir, outputName),
      '--binary',
      '--khr-materials-unlit'
    ], { timeout: 60000, stdio: 'pipe' });
    // 检查输出文件
    if (fs.existsSync(outputPath)) return true;
    // 可能输出在其他位置
    const possibleOutput = path.join(outputDir, outputName + '.glb');
    return fs.existsSync(possibleOutput);
  } catch (err) {
    return false;
  }
}

async function main() {
  const files = fs.readdirSync(MODEL_DIR);
  const fbxFiles = files.filter(f => /\.fbx$/i.test(f));
  
  console.log(`找到 ${fbxFiles.length} 个FBX文件`);
  console.log('---');
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < fbxFiles.length; i++) {
    const file = fbxFiles[i];
    const inputPath = path.join(MODEL_DIR, file);
    const outputName = file.replace(/\.fbx$/i, '.glb');
    const outputPath = path.join(PREVIEW_DIR, outputName);
    
    if (fs.existsSync(outputPath)) {
      skipped++;
      continue;
    }
    
    process.stdout.write(`[${i+1}/${fbxFiles.length}] 转换: ${file} ... `);
    const result = convertFbxToGlb(inputPath, outputPath);
    if (result) {
      success++;
      console.log('✅');
    } else {
      failed++;
      console.log('❌');
    }
  }
  
  console.log('---');
  console.log(`转换完成: 成功${success}个, 失败${failed}个, 跳过${skipped}个`);
}

main().catch(err => {
  console.error('脚本出错:', err);
  process.exit(1);
});
