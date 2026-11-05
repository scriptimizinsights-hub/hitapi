/**
 * background/flows/projects.js — HitAPI projects.
 */

import { api } from '../api/client.js';

export async function listProjects() {
  const data = await api('/projects');
  return Array.isArray(data) ? data : (Array.isArray(data?.projects) ? data.projects : []);
}

export async function createProject({ name, baseUrl }) {
  name = String(name || '').trim();
  baseUrl = String(baseUrl || '').trim();
  if (!name) throw new Error('Enter a project name');
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) throw new Error('Enter a base URL starting with http:// or https://');
  const data = await api('/projects', {
    method: 'POST',
    body: { name, base_url: baseUrl.replace(/\/+$/, ''), environment: 'development' },
  });
  const project = data?.project || data;
  if (!project?.id) throw new Error('HitAPI did not return the new project');
  return project;
}
