import type { DemoApp } from '../types.ts';
import { bookshop } from './bookshop.ts';
import { docs } from './docs.ts';
import { helpdesk } from './helpdesk.ts';
import { jobs } from './jobs.ts';
import { library } from './library.ts';
import { recipes } from './recipes.ts';

export const allApps: DemoApp[] = [bookshop, library, jobs, recipes, docs, helpdesk];
