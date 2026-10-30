import type { Request } from 'express';
export type SafeUser = { id: string; displayName: string; email: string };
export type AuthRequest = Request & { user?: SafeUser };
export type CaseContent = { title: string; briefing: string; incident: string; timeline: {timeLabel:string;event:string}[]; suspects: {id:string;name:string;role:string;profile:string;statement:string;publicMotive?:string}[]; clues: {id:string;title:string;description:string;source:string;relevance:string}[]; solution: {culpritSuspectId:string;motive:string;method:string;explanation:string;evidenceLinks:{clueId:string;deduction:string}[];redHerrings:{clueId:string;explanation:string}[]}; hints:{level:number;text:string}[]; requiredClueIds:string[] };
