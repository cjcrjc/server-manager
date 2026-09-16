import {LearnClient,loadConfig,exportCalendar,publicError} from './learn.mjs';
const now = new Date();
try {
  console.log(JSON.stringify(await exportCalendar(new LearnClient(await loadConfig()),now.toISOString(),new Date(+now+90*86400000).toISOString())));
} catch(e) {console.error(JSON.stringify(publicError(e)));process.exitCode=1;}
