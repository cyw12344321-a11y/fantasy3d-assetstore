'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {backup,verify,restore}=require('../lib/blindbox-backup');
try{
  const [mode,source,target]=process.argv.slice(2),password=process.env.BLINDBOX_BACKUP_PASSPHRASE;
  if(mode==='backup'&&source&&target){
    if(process.env.BLINDBOX_BACKUP_OFFLINE!=='true')throw Error('Stop the service, then set BLINDBOX_BACKUP_OFFLINE=true before taking a consistent snapshot.');
    const archive=backup(path.resolve(source),password);verify(archive,password);
    fs.writeFileSync(path.resolve(target),archive,{flag:'wx',mode:0o600});
    console.log('Encrypted backup created and verified. Keep it outside the deployed web directory.');
  }else if(mode==='verify'&&source){
    const snapshot=verify(fs.readFileSync(source,'utf8'),password);
    console.log(JSON.stringify({verified:true,createdAt:snapshot.createdAt,files:Object.keys(snapshot.files)}));
  }else if(mode==='restore'&&source&&target){
    console.log(JSON.stringify(restore(fs.readFileSync(source,'utf8'),password,path.resolve(target))));
  }else throw Error('Usage: node scripts/blindbox-backup.cjs backup DATA_DIR NEW_ARCHIVE | verify ARCHIVE | restore ARCHIVE NEW_DIRECTORY');
}catch(error){console.error(error.message);process.exitCode=1;}
