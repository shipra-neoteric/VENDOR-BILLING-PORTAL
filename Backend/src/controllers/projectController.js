const { validationResult } = require('express-validator');
const Project      = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, notFound, badRequest } = require('../utils/responseFormatter');
const { nextProjectCode } = require('../utils/codeGen');

exports.listProjects = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const projects = await Project.find(filter).sort({ createdAt: -1 });
  success(res, { projects });
});

exports.getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return notFound(res, 'Project not found');
  success(res, { project });
});

exports.createProject = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const code    = await nextProjectCode();
  const project = await Project.create({ ...req.body, code, createdBy: req.user._id });
  created(res, { project }, 'Project created successfully');
});

exports.updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!project) return notFound(res, 'Project not found');
  success(res, { project }, 'Project updated successfully');
});

exports.deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) return notFound(res, 'Project not found');
  success(res, null, 'Project deleted');
});
