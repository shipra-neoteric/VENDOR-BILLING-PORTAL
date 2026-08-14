const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    code:               { type: String, required: true, unique: true, trim: true },
    name:               { type: String, required: true, trim: true },
    location:           { type: String, trim: true },
    contractValue:      { type: Number, default: 0 },
    budget:             { type: Number, default: 0 },
    client:             { type: String, trim: true, default: '' },
    startDate:          { type: Date },
    expectedCompletion: { type: Date },
    projectType:        { type: String, enum: ['apartment', 'plot'], default: 'apartment' },
    status:             { type: String, enum: ['active', 'completed', 'on-hold'], default: 'active' },
    // Where this project's Daily Progress Reports get posted in Slack — the
    // channel ID (e.g. C0AR8J39S8H), not a channel name, since IDs never
    // change even if the channel gets renamed. Blank means no Slack posting
    // for this project's reports.
    slackChannelId:     { type: String, trim: true, default: '' },
    // A Slack Incoming Webhook URL (hooks.slack.com/services/...) is a bearer
    // credential — anyone holding it can post to that channel with no Slack
    // membership at all. Never returned by listProjects/getProject (see
    // projectController) — only used server-side to build the n8n DPR
    // notification payload. The edit form is write-only: it never echoes this
    // value back, only a `slackWebhookConfigured` boolean.
    slackWebhookUrl:    { type: String, trim: true, default: '' },
    parentId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
