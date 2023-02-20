// Whenever a fill happens we might want to extract potentially
// useful information out of that. Data like like the last time
// a token set got sold/bought and the price associated to that
// sale could offer valuable information to users.

import "@/jobs/fill-updates/queue";
import "@/jobs/fill-updates/fill-post-process";
