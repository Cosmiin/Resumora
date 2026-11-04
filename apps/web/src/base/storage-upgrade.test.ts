import {expect,it} from 'vitest';
import {clearRetiredStorage} from './storage-upgrade';
it('removes only retired translation receipts and preserves CV recovery and preferences',()=>{
 const storage=new Map<string,string>([
 ['resumora:translation:11111111-1111-4111-8111-111111111111:snapshot:en','retired'],
 ['resumora:translation:profile:snapshot:en','retained'],
 ['resumora:import:owner','private cv draft'],['resumora:locale','ro'],['unrelated','keep']]);
 const facade={get length(){return storage.size},key:(i:number)=>[...storage.keys()][i]??null,removeItem:(key:string)=>{storage.delete(key)}};
 clearRetiredStorage(facade);
 expect([...storage.values()]).toEqual(['retained','private cv draft','ro','keep']);
 clearRetiredStorage(facade);expect(storage.size).toBe(4);
});
it('does not prevent startup when browser storage is unavailable',()=>{
 expect(()=>clearRetiredStorage({get length():number{throw Error('blocked')},key:()=>null,removeItem:()=>{}})).not.toThrow();
});
