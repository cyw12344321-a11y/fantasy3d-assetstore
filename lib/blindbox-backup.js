'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,scryptSync,createCipheriv,createDecipheriv}=require('node:crypto');
const files=['blindbox-accounts.json','blindbox-gift-receipts.json','blindbox-signing-key'];
function key(password,salt){
  if(typeof password!=='string'||password.length<16)throw Error('Use a backup passphrase of at least 16 characters.');
  return scryptSync(password,salt,32);
}
function backup(directory,password){
  const snapshot={version:1,createdAt:new Date().toISOString(),files:{}};
  for(const name of files){const file=path.join(directory,name);if(fs.existsSync(file))snapshot.files[name]=fs.readFileSync(file).toString('base64');}
  if(!snapshot.files['blindbox-signing-key'])throw Error('Signing-key file is missing. Back up the complete gift data directory.');
  const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(password,salt),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);
  return JSON.stringify({version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
}
function verify(archive,password){
  if(Buffer.byteLength(archive)>64*1024*1024)throw Error('Archive exceeds the supported size.');
  const envelope=JSON.parse(archive);
  if(envelope.version!==1)throw Error('Unsupported backup version.');
  const salt=Buffer.from(envelope.salt,'base64'),iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');
  if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error('Invalid backup envelope.');
  const decipher=createDecipheriv('aes-256-gcm',key(password,salt),iv);decipher.setAuthTag(tag);
  const snapshot=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8'));
  if(snapshot.version!==1||!snapshot.files||!snapshot.files['blindbox-signing-key'])throw Error('Invalid snapshot.');
  for(const [name,value]of Object.entries(snapshot.files)){
    if(!files.includes(name)||typeof value!=='string')throw Error('Unexpected backup entry.');
    if(name.endsWith('.json'))JSON.parse(Buffer.from(value,'base64').toString('utf8'));
  }
  return snapshot;
}
function restore(archive,password,destination){
  const snapshot=verify(archive,password);
  // Never overwrite a running store, existing directory, or symlink.
  fs.mkdirSync(destination,{recursive:false,mode:0o700});
  for(const [name,value]of Object.entries(snapshot.files))fs.writeFileSync(path.join(destination,name),Buffer.from(value,'base64'),{flag:'wx',mode:0o600});
  return {createdAt:snapshot.createdAt,files:Object.keys(snapshot.files)};
}
module.exports={backup,verify,restore};
