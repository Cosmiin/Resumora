import { expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from '../App';
import { MemoryBaseCvAdapter } from '../base/adapter';
import { workspaceLocation } from '../base/routes';
afterEach(cleanup);
it('opens only the Profile workspace and has no extension navigation',async()=>{
 window.location.hash='#/profile';
 const {container}=render(<App adapter={new MemoryBaseCvAdapter()}/>);
 await screen.findByRole('heading',{name:'Profilul meu'});
 expect(container.querySelector('a[href="#/jobs"]')).toBeNull();
 expect(container.querySelector('a[href^="/extension"]')).toBeNull();
});
it('retired routes have the same missing view as any unknown route',()=>{
 for(const path of ['#/jobs','#/jobs/new','#/jobs/11111111-1111-4111-8111-111111111111'])
 expect(workspaceLocation(path).view).toBe('missing');
});
