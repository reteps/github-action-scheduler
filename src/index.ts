import { load, dump } from "js-yaml";
import { readFile, writeFile, mkdir } from "fs/promises";
import { GeneratedWorkflowTypes } from 'github-actions-workflow-ts'
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import slugify from "slugify";
type Workflow = GeneratedWorkflowTypes.Workflow;
export type Job = GeneratedWorkflowTypes.ReusableWorkflowCallJob | GeneratedWorkflowTypes.NormalJob;

export const checkPath = (path: string): void => {
  if (!path.endsWith(".yml")) {
    throw new Error("File must be a YAML file");
  }
  if (!path.includes(".github/workflows/")) {
    throw new Error("File must be in the .github/workflows directory");
  }
  const absolutePath = resolve(path);
  const gitPath = absolutePath.replace(/\.github.*/, ".git/");
  
  if (!existsSync(gitPath)) {
    throw new Error(`Path ${absolutePath} does not appear to be in a git repository`);
  }
}

export async function loadYaml(path: string, check: boolean = true): Promise<Workflow | undefined> {
  if (check) {
    checkPath(path);
  }

  if (!existsSync(path)) {
    return undefined;
  }

  const content = await readFile(path, "utf8");
  return load(content) as Workflow;
}

export async function saveYaml(path: string, content: Workflow, check: boolean = true): Promise<void> {
  if (check) {
    checkPath(path);
  }

  const preferredKeys = ['name', 'on', 'if']
  const yaml = dump(content, {
    lineWidth: -1,
    sortKeys: (a, b) => {
      let aIdx = preferredKeys.indexOf(a);
      let bIdx = preferredKeys.indexOf(b);
      aIdx = aIdx === -1 ? preferredKeys.length : aIdx;
      bIdx = bIdx === -1 ? preferredKeys.length : bIdx;
      if (aIdx !== bIdx) {
        return aIdx - bIdx;
      }

      return a.localeCompare(b);
    }
  });
  await mkdir(dirname(path), { recursive: true }) 
  await writeFile(path, yaml);
}

const dateToCron = (date: Date) => {
  const minutes = date.getMinutes();
  const hours = date.getHours();
  const days = date.getDate();
  const months = date.getMonth() + 1;
  const dayOfWeek = date.getDay();

  return `${minutes} ${hours} ${days} ${months} ${dayOfWeek}`;
};

type TimedJob = Job & {
  time: Date;
}

const isEvent = (on: any): on is GeneratedWorkflowTypes.Event => {
  return typeof on === "string";
}
const isEventList = (on: any): on is GeneratedWorkflowTypes.Event[] => {
  return Array.isArray(on) && on.every(isEvent);
}
const isEventObject = (on: any): on is Exclude<Workflow["on"], GeneratedWorkflowTypes.Event | GeneratedWorkflowTypes.Event[]> => {
  return typeof on === "object";
}

interface JobScheduleOptions {
  path: string; // Path to the workflow file
  merge?: boolean; // Should we override the existing workflow, or merge in the new jobs?
  check?: boolean; // Should we check if the path is a valid path?
}

export const scheduleJobs = async (jobs: [TimedJob, ...TimedJob[]], options: JobScheduleOptions) => {
  const { path, check = true, merge = false } = options;
  const workflow = (await loadYaml(path, check)) || {} as Workflow;

  // Set defaults so that we can assume they exist.
  workflow.name = workflow.name || "Scheduled Jobs";
  workflow.on = workflow.on || {};

  // workflow.on is either single event or array of events.
  // if it's a single event, we need to convert it to an array.
  // exclude Event or Event[] from the type.
  const schedules = jobs.map((job) => ({
      cron: dateToCron(job.time),
  })) as [
    {
        cron?: string;
    },
    ...{
        cron?: string;
    }[]
  ];

  if (!merge) {
    workflow.on = { schedule: schedules };
  } else {
    if (isEvent(workflow.on)) {
      workflow.on = { [workflow.on]: null, schedule: schedules };
    } else if (isEventList(workflow.on)) {
      workflow.on = {
        ...workflow.on.reduce((acc, event) => ({ ...acc, [event]: null }), {}),
        schedule: schedules,
      };
    } else if (isEventObject(workflow.on)) {
      const uniqueCrons = [
        ...schedules,
        ...(workflow.on.schedule || []),
      ].filter((schedule, index, self) => self.findIndex((s) => s.cron === schedule.cron) === index) as [
        {
            cron?: string;
        },
        ...{
            cron?: string;
        }[]
      ];
  
      workflow.on = {
        ...workflow.on, 
        schedule: uniqueCrons,
      }
    }
  }

  // Override if guard
  const namedConditionedJobs = jobs.map((job) => {
    const { time, if: _if, name: _name, ...rest } = job;
    return {
      name: (job.name || 'Scheduled job') + `at ${job.time.toISOString()}`,
      if: `github.event.schedule == '${dateToCron(time)}'`,
      ...rest,
    };
  }).reduce((acc, job) => {
    acc[slugify(job.name || 'unknown', { remove: /[*+~.()'"!:@]/g })] = job;
    return acc;
  }, {} as Record<string, Job>);

  workflow.jobs = {
    ...namedConditionedJobs,
    ...((merge) ? workflow.jobs : {}),
  };
  await saveYaml(path, workflow, check);
}