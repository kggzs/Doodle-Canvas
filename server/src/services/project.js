// -*- coding: utf-8 -*-
/**
 * 项目持久化服务
 */
import db from '../models/index.js';

const { Project } = db;

export class ProjectError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function normalizePage(page = 1, pageSize = 20) {
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  return {
    page: currentPage,
    pageSize: limit,
    offset: (currentPage - 1) * limit
  };
}

function countNodes(canvasData = {}) {
  return Array.isArray(canvasData?.nodes) ? canvasData.nodes.length : 0;
}

export async function listProjects(userId, params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const { rows, count } = await Project.findAndCountAll({
    where: { userId },
    order: [['updatedAt', 'DESC']],
    limit: pageSize,
    offset
  });

  return { items: rows, total: count, page, pageSize };
}

export async function createProject(userId, data = {}) {
  if (!data.name || String(data.name).trim().length === 0) {
    throw new ProjectError(42201, '项目名称不能为空');
  }

  return Project.create({
    userId,
    name: String(data.name).trim(),
    description: data.description || null,
    canvasData: data.canvas_data || data.canvasData || { nodes: [], edges: [], viewport: {} },
    thumbnailFileId: data.thumbnail_file_id || data.thumbnailFileId || null,
    nodeCount: countNodes(data.canvas_data || data.canvasData),
    isPublic: Boolean(data.is_public ?? data.isPublic ?? false)
  });
}

export async function getProject(userId, id) {
  const project = await Project.findOne({ where: { id, userId } });
  if (!project) throw new ProjectError(40402, '项目不存在');
  return project;
}

export async function updateProject(userId, id, data = {}) {
  const project = await getProject(userId, id);
  const payload = {};

  if (data.name !== undefined) payload.name = String(data.name).trim();
  if (data.description !== undefined) payload.description = data.description || null;
  if (data.canvas_data !== undefined || data.canvasData !== undefined) {
    const canvasData = data.canvas_data || data.canvasData || {};
    payload.canvasData = canvasData;
    payload.nodeCount = countNodes(canvasData);
  }
  if (data.thumbnail_file_id !== undefined || data.thumbnailFileId !== undefined) {
    payload.thumbnailFileId = data.thumbnail_file_id || data.thumbnailFileId || null;
  }
  if (data.is_public !== undefined || data.isPublic !== undefined) {
    payload.isPublic = Boolean(data.is_public ?? data.isPublic);
  }

  await project.update(payload);
  return project;
}

export async function deleteProject(userId, id) {
  const project = await getProject(userId, id);
  await project.destroy();
  return { deleted: true };
}

export default {
  ProjectError,
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject
};
