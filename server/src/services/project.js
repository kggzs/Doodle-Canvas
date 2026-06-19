// -*- coding: utf-8 -*-
/**
 * 项目持久化服务
 */
import db from '../models/index.js';

const { GenerationRecord, Project } = db;

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

function latestMediaThumbnail(canvasData = {}) {
  const nodes = Array.isArray(canvasData?.nodes) ? canvasData.nodes : [];
  const mediaNodes = nodes
    .filter((node) => ['image', 'video'].includes(node.type) && node.data?.url)
    .sort((a, b) => {
      const aTime = Number(a.data?.updatedAt || a.data?.createdAt || 0);
      const bTime = Number(b.data?.updatedAt || b.data?.createdAt || 0);
      return bTime - aTime;
    });
  return mediaNodes[0]?.data?.thumbnail || mediaNodes[0]?.data?.url || '';
}

function serializeProject(project) {
  const plain = typeof project.toJSON === 'function' ? project.toJSON() : { ...project };
  const canvasData = plain.canvasData || {};
  const thumbnail = canvasData.thumbnail || latestMediaThumbnail(canvasData);
  return {
    ...plain,
    canvasData,
    canvas_data: canvasData,
    thumbnail
  };
}

async function requireProject(userId, id) {
  const project = await Project.findOne({ where: { id, userId } });
  if (!project) throw new ProjectError(40402, '项目不存在');
  return project;
}

export async function listProjects(userId, params = {}) {
  const { page, pageSize, offset } = normalizePage(params.page, params.pageSize);
  const { rows, count } = await Project.findAndCountAll({
    where: { userId },
    order: [['updatedAt', 'DESC']],
    limit: pageSize,
    offset
  });

  return { items: rows.map(serializeProject), total: count, page, pageSize };
}

export async function createProject(userId, data = {}) {
  if (!data.name || String(data.name).trim().length === 0) {
    throw new ProjectError(42201, '项目名称不能为空');
  }

  const project = await Project.create({
    userId,
    name: String(data.name).trim(),
    description: data.description || null,
    canvasData: data.canvas_data || data.canvasData || { nodes: [], edges: [], viewport: {} },
    thumbnailFileId: data.thumbnail_file_id || data.thumbnailFileId || null,
    nodeCount: countNodes(data.canvas_data || data.canvasData),
    isPublic: Boolean(data.is_public ?? data.isPublic ?? false)
  });
  return serializeProject(project);
}

export async function getProject(userId, id) {
  return serializeProject(await requireProject(userId, id));
}

export async function updateProject(userId, id, data = {}) {
  const project = await requireProject(userId, id);
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
  return serializeProject(project);
}

export async function deleteProject(userId, id) {
  await requireProject(userId, id);
  await db.sequelize.transaction(async (transaction) => {
    await GenerationRecord.update(
      { projectId: null },
      { where: { userId, projectId: id }, transaction }
    );
    await Project.destroy({ where: { id, userId }, transaction });
  });
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
