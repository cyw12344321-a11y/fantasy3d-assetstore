// 批量3D模型转换脚本 - OBJ转GLB
const fs = require('fs');
const path = require('path');
const obj2gltf = require('obj2gltf');

const MODEL_DIR = 'D:\\3D模型';
const PREVIEW_DIR = 'D:\\3D模型\\_preview'; // 预览文件放这里，不影响原文件

// 确保预览目录存在
if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

async function convertObjToGlb(inputPath, outputPath) {
  try {
    const options = {
      binary: true, // 输出GLB二进制格式
      compress: false,
      metallicRoughness: true
    };
    const glb = await obj2gltf(inputPath, options);
    fs.writeFileSync(outputPath, Buffer.from(glb));
    return true;
  } catch (err) {
    console.error(`转换失败: ${path.basename(inputPath)} - ${err.message}`);
    return false;
  }
}

async function main() {
  const files = fs.readdirSync(MODEL_DIR);
  const objFiles = files.filter(f => /\.obj$/i.test(f));
  
  console.log(`找到 ${objFiles.length} 个OBJ文件`);
  console.log(`预览文件输出到: ${PREVIEW_DIR}`);
  console.log('---');
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < objFiles.length; i++) {
    const file = objFiles[i];
    const inputPath = path.join(MODEL_DIR, file);
    const outputName = file.replace(/\.obj$/i, '.glb');
    const outputPath = path.join(PREVIEW_DIR, outputName);
    
    // 已经转换过的跳过
    if (fs.existsSync(outputPath)) {
      skipped++;
      continue;
    }
    
    process.stdout.write(`[${i+1}/${objFiles.length}] 转换: ${file} ... `);
    const result = await convertObjToGlb(inputPath, outputPath);
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
