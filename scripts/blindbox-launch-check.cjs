'use strict';
const {releaseConfig}=require('../lib/blindbox-release');
const config=releaseConfig();
const checks=[
 ['production-mode',config.production],
 ['persistent-storage-declared',config.persistent],
 ['public-https-origin',Boolean(config.publicOrigin)],
 ['support-contact',Boolean(config.support)],
 ['operator-name',Boolean(config.operator)]
];
for(const [name,pass]of checks)console.log((pass?'PASS ':'BLOCK ')+name);
console.log('These are configuration checks, not a storage restore drill, payment approval or legal review. Payments remain disabled.');
process.exitCode=checks.every(([,pass])=>pass)?0:1;
