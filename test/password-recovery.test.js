import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isRecoveryLink,recoveryTokens,requestPasswordRecovery,changeRecoveredPassword} from '../password-recovery.js';
test('recuperación exige tokens completos y distingue navegación normal',()=>{
 assert.equal(isRecoveryLink(''),false);assert.equal(isRecoveryLink('#home'),false);
 assert.equal(isRecoveryLink('#type=recovery&access_token=a&refresh_token=b'),true);
 assert.equal(isRecoveryLink('#error_code=otp_expired'),true);
 assert.throws(()=>recoveryTokens('#type=recovery&access_token=a'));
 assert.throws(()=>recoveryTokens('#type=signup&access_token=a&refresh_token=b'));
 assert.deepEqual(recoveryTokens('#type=recovery&access_token=a&refresh_token=b'),{access_token:'a',refresh_token:'b'});
});
test('solicita recuperación a la misma app sin crear ni iniciar cuentas',async()=>{
 let call;const client={auth:{resetPasswordForEmail:async(...args)=>{call=args;return {error:null}}}};
 await requestPasswordRecovery(client,'persona@example.com','https://molaromauro-coder.github.io/mis-gastos/');
 assert.deepEqual(call,['persona@example.com',{redirectTo:'https://molaromauro-coder.github.io/mis-gastos/'}]);
 await assert.rejects(()=>requestPasswordRecovery(client,'incorrecto','/'));
 await assert.rejects(()=>requestPasswordRecovery({auth:{resetPasswordForEmail:async()=>({error:Error('smtp')})}},'persona@example.com','/'),/smtp/);
});
test('rechaza contraseñas cortas, distintas o enlaces sin identidad verificada',async()=>{
 let writes=0;const client={auth:{getUser:async()=>({data:{user:null}}),updateUser:async()=>{writes++;return {error:null}}}};
 await assert.rejects(()=>changeRecoveredPassword(client,'123','123'));
 await assert.rejects(()=>changeRecoveredPassword(client,'12345678','87654321'));
 await assert.rejects(()=>changeRecoveredPassword(client,'12345678','12345678'),/venció/);assert.equal(writes,0);
});
test('actualiza solo la contraseña tras verificar usuario y propaga fallo de servidor',async()=>{
 let call;const client={auth:{getUser:async()=>({data:{user:{id:'u'}}}),updateUser:async(value)=>{call=value;return {error:null}}}};
 await changeRecoveredPassword(client,'nueva-clave-123','nueva-clave-123');assert.deepEqual(call,{password:'nueva-clave-123'});
 client.auth.updateUser=async()=>({error:Error('expired')});await assert.rejects(()=>changeRecoveredPassword(client,'nueva-clave-123','nueva-clave-123'),/expired/);
});
test('el enlace de recuperación aísla la sesión y evita arranque de sincronización y datos',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/if\(isRecoveryLink\(location.hash\)\)\{\s*await startPasswordRecovery\(\);\s*\}else\{/);
 const module=readFileSync(new URL('../password-recovery.js',import.meta.url),'utf8');
 assert.match(module,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
 assert.doesNotMatch(module,/localStorage|applyState|sync_heads|sync_backups|commit_sync/);
 assert.ok(module.indexOf("history.replaceState")<module.indexOf('const tokens=recoveryTokens(hash);await sdk()'));
});
