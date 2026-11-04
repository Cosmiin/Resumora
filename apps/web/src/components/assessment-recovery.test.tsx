import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { GuidedExperience } from './GuidedExperience';
import { ExperienceScoresContext } from './useProfileExperienceScores';
import { LanguageContext } from './ui';
import { questionFixture } from './guided-question-cache.test-fixture';
it('offers a direct assessment retry in the guided view while leaving questions usable', () => {
 const draft=questionFixture(); const check=vi.fn();
 render(<LanguageContext value="en"><ExperienceScoresContext value={{forRole:()=>({queue:vi.fn(),check,running:false,preparing:false,error:'failed',automatic:true})}}><GuidedExperience draft={draft} targetId={draft.roles[0].id} change={vi.fn()} ready saveFailed={false} request={vi.fn()} /></ExperienceScoresContext></LanguageContext>);
 fireEvent.click(screen.getByRole('button',{name:'Retry assessment'}));
 expect(check).toHaveBeenCalledOnce();
 expect((screen.getByRole('button',{name:'Improve your experience through questions'}) as HTMLButtonElement).disabled).toBe(false);
});
