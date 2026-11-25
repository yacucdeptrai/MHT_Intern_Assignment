# Software Requirements Specification

> **Project:** Project & Task Management System
> **Spec:** [Design 2026-11-16](./superpowers/specs/2026-11-16-project-docs-design.md)
> **Related:** [Architecture](./02-architecture.md) · [Database design](./03-database-design.md) · [RBAC & workflow](./05-rbac-and-workflow.md) · [Routes & actions](./06-routes-and-actions.md)
> **Source:** [`nativedocs/02-project-requirements.md`](./nativedocs/02-project-requirements.md), [`nativedocs/03-wbs-gantt-chart.md`](./nativedocs/03-wbs-gantt-chart.md)

---

## 1. Purpose and Scope

The system is an internal platform for **one organization** to manage users, projects, sprints, and tasks. It covers an approval workflow, real-time notifications, Slack and email integrations, reports, and personal dashboards.

This document is the authoritative English requirements set. It restates the 35 functions of `nativedocs/02` as `FR-01`…`FR-35`, adds `FR-36` (Sprint management) and `FR-37` (Accept invite), and records the product decisions that resolve gaps in the source.

Wherever this document and `nativedocs/` disagree, this document wins.

## 2. Actors

| Actor | Description |
| :--- | :--- |
| **Admin** | System role `ADMIN`. Manages users, statuses, and the audit log. Can access every project, with PM-equivalent rights in each. |
| **PM** | System role `PM`. Can create projects and accesses only the projects they are a member of. |
| **Team Lead** | System role `TEAM_LEAD`. Inside projects, rights come from the project role. |
| **Member** | System role `MEMBER`. Inside projects, rights come from the project role. |
| **Project PM / Team Lead / Member** | Project role (`PM`, `TEAM_LEAD`, `MEMBER`) held on a specific project. |
| **System** | Scheduled and background processing: realtime push, Slack, email, cron. |

A user's **system role** decides their layout and system-level rights. Their **project role** decides what they can do inside that project. See [RBAC & workflow](./05-rbac-and-workflow.md).

## 3. Product Decisions

These decisions fill gaps or settle contradictions in the source. They are binding.

| # | Topic | Decision | Settles |
| :-- | :--- | :--- | :--- |
| P1 | Tenancy | Single organization. No tenant IDs, no tenant isolation, no organization switching. | `AGENTS.md` §1 "multi-tenant" |
| P2 | Roles | `User.systemRole` ∈ `MEMBER`, `TEAM_LEAD`, `PM`, `ADMIN`. `ProjectMember.projectRole` ∈ `PM`, `TEAM_LEAD`, `MEMBER`. | Role/project-role ambiguity |
| P3 | Project access | Admin can access every project. A system PM can access only the projects they are a member of. Creating a project needs system `PM` or `ADMIN`, and the creator becomes that project's PM. Everyone else needs project membership. **Non-members receive 404.** The check is enforced in the service layer. | WBS 2.0 "non-members can view projects" |
| P4 | Layouts | The layout follows the system role: `_admin` for `ADMIN`/`PM`, `_member` for the others. Project pages are shared by both layouts and render controls from the project role. Unauthenticated users go to `/login?redirectTo=…`. | WBS 2.0 "separate two layouts" |
| P5 | Statuses | Statuses are system-wide and Admin-managed. Each belongs to one fixed category: `TODO`, `IN_PROGRESS`, `REVIEW`, or `DONE`. Each category has exactly one default status. A status in use cannot be deleted. The 9 statuses of `nativedocs/01` track *team* progress only. | 9 vs 4 statuses |
| P6 | Transitions | Editors move tasks among `TODO`/`IN_PROGRESS`/`REVIEW` statuses. Only **Approve** (from `REVIEW`, by project TEAM_LEAD/PM or Admin) reaches `DONE`. **Reject** (from `REVIEW`, same roles, reason required) goes to the default `IN_PROGRESS` status. | FR-20–FR-23 semantics |
| P7 | Reopen | A project TEAM_LEAD/PM or Admin can reopen a `DONE` task to the default `IN_PROGRESS` status, with a reason. | Leaving Done (accepted) |
| P8 | Task permissions | **Create:** any project member. **Edit or move:** creator, assignees, project TEAM_LEAD/PM, Admin. **Archive:** creator, project TEAM_LEAD/PM, Admin. **Assign:** project TEAM_LEAD/PM, Admin. Comments and attachments can be added by any project member, and deleted by their author or a project PM/Admin. | FR-12/13/14/21 "All" |
| P9 | Deletion | Projects, tasks, and sprints are soft deleted, labeled "Archive". No hard delete in v1. | FR-09 "delete or archive" |
| P10 | Onboarding | No public sign-up. An Admin creates users, or a project PM invites by email. Invites expire after 7 days, and the invitee sets a password on acceptance. | WBS "Sign up" row |
| P11 | Sprints | A sprint belongs to one project and has a name, start date, and end date (end ≥ start). A task can optionally be in one sprint of the **same project**. Completion rate = Done top-level tasks ÷ all non-archived top-level tasks; an empty sprint shows "No tasks". | FR-31 "sprint completion rate" |
| P12 | Sub-tasks | A sub-task is a task with a parent, one level deep. It shares the parent's project and sprint. | FR-17 |
| P13 | Reports | FR-30 is available to project TEAM_LEAD/PM. FR-31 and FR-32 are available to project PM and Admin. FR-24 (system audit log) is Admin-only, while task history is visible to project members. | Report roles |
| P14 | i18n | English (default) and Vietnamese. | Checklist item 9 |
| P15 | Users | `status` is `ACTIVE` or `LOCKED`. Users are soft deleted. Each request re-reads the user, so locking takes effect on the next request. Profile includes department (Admin-edited), phone, and avatar. An SSO-only user can set a password. | FR-03, FR-05, FR-06 |
| P16 | Projects | Unique uppercase `code` (2–10 characters, immutable), name, description, optional budget, start/end dates, and `status` ∈ `ACTIVE`, `ON_HOLD`, `COMPLETED`. | FR-07, FR-08 |
| P17 | Task fields | Priority ∈ `LOW`, `MEDIUM` (default), `HIGH`, `URGENT`. Optional start date and due date. Assignees must be project members. | FR-12, FR-15, FR-35 |
| P18 | Comments | Threaded one level deep. A reply to a reply attaches to the root comment. | FR-19 |
| P19 | Shared definitions | **Overdue:** due date passed, category ≠ `DONE`, not archived. **Due soon:** due within 24 hours. **Today's priorities:** the user's overdue or due-today tasks, plus their `HIGH`/`URGENT` tasks that are not Done. | FR-29, FR-33, FR-34 |
| P20 | Deadline email | Sent to assignees, once per reminder kind per due date. With the console sender, the requirement is met in mock form. | FR-29 |
| P21 | Bottlenecks | Tasks in Review longer than 2 days, overdue tasks grouped by status, and task distribution across statuses. | FR-31 |

## 4. Functional Requirements

Each requirement lists its roles, a user story, acceptance criteria (Given / When / Then), and its source.

- Unless a criterion says otherwise, a **non-member** requesting any project-scoped resource receives **404**.
- A signed-in user who lacks a permission receives **403**.
- An unauthenticated user is redirected to `/login?redirectTo=<path>`.

### 4.1 Authentication and Users

### FR-01 Login

- **Roles:** All
- **Story:** As a user, I sign in with my email and password so that I can reach my workspace.
- **Acceptance criteria:**
  1. Given an `ACTIVE` user with a password, When they submit the correct email (case-insensitive) and password, Then a session cookie is set and they land on their layout's home page, or on `redirectTo` if it is a same-origin path.
  2. Given a wrong password or an unknown email, When they submit, Then the same generic error "Email or password is incorrect" is shown, and the email field keeps its value.
  3. Given a `LOCKED` or deleted user, When they submit correct credentials, Then sign-in is refused with "This account is locked. Contact an administrator."
  4. Given a `redirectTo` pointing to another origin, When sign-in succeeds, Then the user goes to their home page instead.
- **Source:** `nativedocs/02` #01

### FR-02 Single Sign-On

- **Roles:** All
- **Story:** As a user, I sign in with Google or Microsoft so that I do not need another password.
- **Acceptance criteria:**
  1. Given a provider account whose verified email matches an existing `ACTIVE` user, When the OAuth callback succeeds, Then the provider account is linked (`oauth_accounts`) and a session is created.
  2. Given a provider email that matches no user, When the callback completes, Then sign-in is refused with "No account exists for this email. Ask an administrator for an invite." No user is created automatically.
  3. Given a `LOCKED` user, When the callback completes, Then sign-in is refused as in FR-01 criterion 3.
  4. Given provider credentials are not configured in the environment, When the login page renders, Then that provider's button is hidden.
- **Source:** `nativedocs/02` #02

### FR-03 User Management

- **Roles:** Admin
- **Story:** As an Admin, I create, edit, lock, unlock, and delete user accounts.
- **Acceptance criteria:**
  1. Given an Admin, When they create a user with full name, email, system role, and optional department, Then the user exists as `ACTIVE`, an `USER_CREATED` audit entry is written, and the Admin can copy a one-time invite link that lets the user set a password (see FR-37).
  2. Given an email already used by another user, When the Admin creates or edits a user with it, Then the form returns a 400 field error "Email is already in use" and keeps all entered values.
  3. Given an `ACTIVE` user who has a session, When the Admin locks them, Then the user's next request signs them out, and `USER_LOCKED` is audited.
  4. Given a user, When the Admin deletes them, Then the user is soft deleted, can no longer sign in, and their tasks, comments, and audit entries remain, showing "Deleted user".
  5. Given an Admin, When they try to lock, delete, or demote themselves, Then the action is rejected with 400 "You cannot change your own access".
  6. Given a non-Admin, When they open the user management page or post to its action, Then they receive 403.
- **Source:** `nativedocs/02` #03

### FR-04 System Role Assignment

- **Roles:** Admin
- **Story:** As an Admin, I set a user's system role to Member, Team Lead, PM, or Admin.
- **Acceptance criteria:**
  1. Given an Admin, When they change a user's system role, Then the new role applies on the user's next request (layout and system rights), and `USER_ROLE_CHANGED` is audited with the old and new values.
  2. Given the last remaining Admin, When anyone tries to demote them, Then the request is rejected with 400 "At least one administrator is required".
  3. Given a non-Admin, When they post a role change, Then they receive 403.
- **Source:** `nativedocs/02` #04

### FR-05 View Profile

- **Roles:** All
- **Story:** As a user, I view my profile: name, email, phone, department, system role, and my project memberships with their roles.
- **Acceptance criteria:**
  1. Given a signed-in user, When they open `/profile`, Then they see their own data only.
  2. Given any user, When they request another user's profile page, Then no such route exists. Other users' names and avatars appear only where projects show members.
- **Source:** `nativedocs/02` #05

### FR-06 Update Profile

- **Roles:** All
- **Story:** As a user, I update my avatar, phone, and contact details, and change my password.
- **Acceptance criteria:**
  1. Given a user, When they upload an avatar (PNG, JPEG, or WebP, up to 10 MB), Then it is stored in R2 and shown across the app.
  2. Given a user with a password, When they change it, Then the current password must be correct and the new one must be at least 10 characters; otherwise a 400 field error is shown.
  3. Given an SSO-only user without a password, When they set one, Then no current password is required.
  4. Given a user, When they try to change their email, department, or system role, Then those fields are not editable. Only an Admin changes them (FR-03).
- **Source:** `nativedocs/02` #06

### FR-37 Accept Invite

- **Roles:** Invitee (unauthenticated)
- **Story:** As an invited person, I open my invite link and set a password so that I can sign in.
- **Acceptance criteria:**
  1. Given a valid, unexpired, unused invite token, When the invitee opens `/invite/<token>`, Then they see the inviting project (if any) and a set-password form.
  2. Given that form, When the invitee submits a password of at least 10 characters, Then, in one atomic operation, the user is created (or activated), the project membership is created if the invite carries one, and the token is consumed. The invitee is then signed in.
  3. Given a token older than 7 days, already used, or unknown, When it is opened, Then the page shows "This invite is invalid or has expired" and no form.
  4. Given a PM inviting someone, When the invite is created, Then an `EMAIL_INVITE` job is queued and the link is also shown to the PM to copy, because email delivery may not be configured.
- **Source:** WBS "Sign up" row, replaced per P10

### 4.2 Projects

### FR-07 Create Project

- **Roles:** System PM, Admin
- **Story:** As a PM, I create a project with a code, name, description, budget, and timeline.
- **Acceptance criteria:**
  1. Given a system PM or Admin, When they submit a code (2–10 characters, letters, digits, or hyphens, stored uppercase), a name, an optional description, an optional budget (an integer in minor units of `APP_CURRENCY`, at least 0), and start/end dates, Then, in one atomic operation, the project is created with status `ACTIVE`, the creator becomes its project PM, and `PROJECT_CREATED` is audited.
  2. Given a code that already exists, including on archived projects, When they submit, Then a 400 field error "Project code is already in use" is shown and the input is kept.
  3. Given an end date before the start date, When they submit, Then a 400 field error is shown.
  4. Given a system `MEMBER` or `TEAM_LEAD`, When they post to create a project, Then they receive 403.
- **Source:** `nativedocs/02` #07

### FR-08 Update Project

- **Roles:** Project PM, Admin
- **Story:** As a project PM, I edit the name, description, budget, timeline, and status (Active, On hold, Completed).
- **Acceptance criteria:**
  1. Given a project PM or Admin, When they save valid changes, Then the project is updated and `PROJECT_UPDATED` is audited with the changed fields.
  2. Given any user, When they try to change the project code, Then the field is read-only and a posted code is ignored.
  3. Given a project TEAM_LEAD or MEMBER, When they post an update, Then they receive 403.
- **Source:** `nativedocs/02` #08

### FR-09 Archive Project

- **Roles:** Project PM, Admin
- **Story:** As a project PM, I archive a project that is no longer active.
- **Acceptance criteria:**
  1. Given a project PM or Admin, When they confirm archiving, Then the project is soft deleted, disappears from every list, and `PROJECT_ARCHIVED` is audited.
  2. Given an archived project, When a former member opens its URL, Then they receive 404. An Admin can still view it from the admin project list, filtered by "Archived".
  3. Given a project TEAM_LEAD or MEMBER, When they post archive, Then they receive 403.
  4. Given an archived project viewed by an Admin, When any action is posted that changes the project, its members, sprints, tasks, comments, or attachments, Then the request is rejected with 403 "This project is archived". The project is read-only.
- **Source:** `nativedocs/02` #09, per P9

### FR-10 Add Project Member

- **Roles:** Project PM, Admin
- **Story:** As a project PM, I search users and add them to the project, or invite someone new by email.
- **Acceptance criteria:**
  1. Given a project PM, When they search by name or email, Then only `ACTIVE` users who are not yet members are listed.
  2. Given a selected user and a project role, When they add them, Then the membership, a `MEMBER_ADDED` audit entry, and a `PROJECT_MEMBER_ADDED` notification to the added user are written atomically.
  3. Given an email with no user account, When the PM invites it, Then an invite carrying the project and role is created (see FR-37).
  4. Given a project PM, When they remove a member who still has assigned tasks, Then the member is removed, their assignments on unarchived tasks are removed in the same operation, and `MEMBER_REMOVED` is audited.
  5. Given the project's last PM, When anyone tries to remove them or change their role, Then the request is rejected with 400 "A project needs at least one PM".
  6. Given a project TEAM_LEAD or MEMBER, When they post a member change, Then they receive 403.
- **Source:** `nativedocs/02` #10

### FR-11 Assign Project Role

- **Roles:** Project PM, Admin
- **Story:** As a project PM, I set each member's project role (PM, Team Lead, Member).
- **Acceptance criteria:**
  1. Given a project PM, When they change a member's role, Then it takes effect on that member's next request, and `MEMBER_ROLE_CHANGED` is audited.
  2. Given the project's last PM, When anyone demotes them, Then the request is rejected as in FR-10 criterion 5.
  3. Given a project TEAM_LEAD or MEMBER, When they post a role change, Then they receive 403.
- **Source:** `nativedocs/02` #11

### 4.3 Sprints

### FR-36 Sprint Management

- **Roles:** Project PM, project Team Lead, Admin
- **Story:** As a project lead, I create sprints with a name and dates, and put tasks in them, so that sprint completion can be reported.
- **Acceptance criteria:**
  1. Given a project PM or TEAM_LEAD, When they create a sprint with a name (1–100 characters), a start date, and an end date ≥ the start date, Then it is created and `SPRINT_CREATED` is audited.
  2. Given a task editor (P8) and a task that is not Done, When they set the task's sprint to a non-archived sprint of the same project, or clear it, Then the change is saved. Sub-tasks always follow their parent's sprint. Changing a parent's sprint updates its sub-tasks in the same operation, and a sprint posted for a sub-task is ignored.
  3. Given a sprint from another project, When it is submitted as a task's sprint, Then the request is rejected with 400 and the field error "Sprint does not belong to this project". The database's composite foreign key also prevents it.
  4. Given a sprint is archived, When its tasks are viewed, Then those tasks show no sprint. They are unlinked in the same operation, and `SPRINT_ARCHIVED` is audited.
  5. Given a project MEMBER, When they post a sprint create, update, or archive, Then they receive 403.
- **Source:** FR-31 "sprint completion rate", per P11

### 4.4 Tasks

### FR-12 Create Task

- **Roles:** Any project member
- **Story:** As a project member, I create a task with a title, description, priority, and dates.
- **Acceptance criteria:**
  1. Given a project member, When they submit a title (1–200 characters), an optional description (up to 10,000 characters), a priority (default `MEDIUM`), an optional start date and due date (due ≥ start when both are set), and an optional sprint, Then, in one atomic operation, the task is created in the default `TODO` status, the creator is recorded, `TASK_CREATED` is audited, and a `SLACK_POST_TASK` job is queued.
  2. Given invalid input, When they submit, Then 400 field errors are returned and the form keeps its values.
  3. Given a non-member, When they post to the project's task action, Then they receive 404.
- **Source:** `nativedocs/02` #12

### FR-13 Update Task

- **Roles:** Creator, assignees, project Team Lead, project PM, Admin
- **Story:** As someone responsible for a task, I edit its title, description, priority, dates, and sprint.
- **Acceptance criteria:**
  1. Given an allowed editor, When they save changes along with the version they loaded, Then the task is updated, its version increments, and `TASK_UPDATED` is audited with the changed fields.
  2. Given another user saved the task since it was loaded, When the editor saves, Then the request returns 409 "This task was changed by someone else. Reload to see the latest version." and nothing is written.
  3. Given a project MEMBER who is neither the creator nor an assignee, When they post an update, Then they receive 403.
  4. Given a task in a `DONE` status, When anyone, including a lead, posts an update (title, dates, priority, or sprint), Then the request is rejected with 403 "Reopen the task to edit it". Approved work is frozen until it is reopened (FR-23).
- **Source:** `nativedocs/02` #13, per P8

### FR-14 Archive Task

- **Roles:** Creator, project Team Lead, project PM, Admin
- **Story:** As the creator or a lead, I archive a task that is no longer needed.
- **Acceptance criteria:**
  1. Given the creator or a project TEAM_LEAD/PM, When they archive a task, Then the task and its sub-tasks are soft deleted together, and `TASK_ARCHIVED` is audited.
  2. Given an assignee who is not the creator and holds only the MEMBER project role, When they post archive, Then they receive 403.
- **Source:** `nativedocs/02` #14, per P8

### FR-15 Assign Task

- **Roles:** Project Team Lead, project PM, Admin
- **Story:** As a lead, I assign a task to one or more project members.
- **Acceptance criteria:**
  1. Given a project TEAM_LEAD or PM, When they set the assignees, Then the assignee set is replaced atomically, `TASK_ASSIGNED` is audited, and each newly added assignee receives a `TASK_ASSIGNED` notification.
  2. Given a user who is not a member of the project, When they are submitted as an assignee, Then the request is rejected with 400 "Assignees must be project members".
  3. Given a project MEMBER, When they post an assignment, Then they receive 403.
- **Source:** `nativedocs/02` #15

### FR-16 Task List

- **Roles:** All
- **Story:** As a user, I list tasks filtered by project, status, assignee, and priority.
- **Acceptance criteria:**
  1. Given a user, When they open "My tasks", Then they see their non-archived assigned tasks across every project they can access, filterable by project, status, priority, and due range.
  2. Given a project member, When they open a project's task list, Then they see that project's non-archived tasks, filterable by status, assignee, priority, and sprint, and paginated 50 per page.
  3. Given filter values in the URL, When the page reloads, Then the same filters apply.
  4. Given a non-member, When they request a project task list, Then they receive 404.
- **Source:** `nativedocs/02` #16

### FR-17 Sub-tasks

- **Roles:** Any project member
- **Story:** As a member, I split a task into sub-tasks to track detailed progress.
- **Acceptance criteria:**
  1. Given a top-level task, When a member adds a sub-task, Then it is created with the parent's project and sprint, and the parent shows "done / total" sub-task progress.
  2. Given a sub-task, When anyone tries to add a sub-task beneath it, Then the request is rejected with 400 "Sub-tasks cannot have sub-tasks".
  3. Given sub-tasks, When permissions are checked, Then the same rules as for tasks apply (P8), evaluated on the sub-task itself.
- **Source:** `nativedocs/02` #17

### FR-18 Attachments

- **Roles:** Any project member (upload); uploader, project PM, Admin (delete)
- **Story:** As a member, I attach files to a task.
- **Acceptance criteria:**
  1. Given a project member, When they upload a file of up to 10 MB, Then it is stored in R2 under `projects/{projectId}/tasks/{taskId}/{attachmentId}`, its record is written, and `ATTACHMENT_ADDED` is audited.
  2. Given a file larger than 10 MB, When uploaded, Then the request is rejected with 400 "File is larger than 10 MB" and nothing is stored.
  3. Given a non-member, When they request an attachment download URL, Then they receive 404. No public bucket URL exists.
  4. Given a member who is neither the uploader nor a project PM/Admin, When they post a delete, Then they receive 403.
- **Source:** `nativedocs/02` #18

### FR-19 Comments

- **Roles:** Any project member (post); author, project PM, Admin (delete)
- **Story:** As a member, I discuss a task in threaded comments.
- **Acceptance criteria:**
  1. Given a project member, When they post a comment (1–5,000 characters), Then it appears on the task, and the task's creator and assignees (except the author) receive a `TASK_COMMENTED` notification, written atomically with the comment.
  2. Given a comment, When a member replies, Then the reply is attached to the root comment, which keeps threads one level deep.
  3. Given a member who is not the author or a project PM/Admin, When they post a delete, Then they receive 403. A deleted comment shows "Comment deleted" while its replies remain.
- **Source:** `nativedocs/02` #19

### 4.5 Workflow

### FR-20 Configure Statuses

- **Roles:** Admin
- **Story:** As an Admin, I manage the system-wide statuses and their categories.
- **Acceptance criteria:**
  1. Given an Admin, When they create a status with a name (1–50 characters, unique) and a category, Then it is available to every project.
  2. Given an Admin, When they rename or reorder statuses, or choose a category's default status, Then the change applies everywhere, and each category always has exactly one default.
  3. Given a status used by any task, including archived tasks, When the Admin deletes it, Then the request is rejected with 400 "This status is in use by N tasks".
  4. Given a status, When the Admin tries to change its category, Then the change is rejected if any task uses the status. Otherwise it is allowed.
  5. Given a non-Admin, When they post to status management, Then they receive 403.
- **Source:** `nativedocs/02` #20, per P5

### FR-21 Change Task Status

- **Roles:** Task editors (P8)
- **Story:** As someone working on a task, I move it between statuses as work progresses.
- **Acceptance criteria:**
  1. Given a task editor, When they move a task to any status whose category is `TODO`, `IN_PROGRESS`, or `REVIEW`, Then, atomically, the status changes, `TASK_STATUS_CHANGED` is audited, and a `SLACK_UPDATE_THREAD` job is queued.
  2. Given a project member who can edit the task, When they submit a status in the `DONE` category through the update form, Then the request is rejected with 403 "Only an approval can complete a task" and the status is unchanged.
  3. Given a task in a `DONE` status, When an editor tries to move it, Then the request is rejected with 403. Only Reopen (FR-23) leaves Done.
  4. Given a project MEMBER who is neither the creator nor an assignee, When they post a status change, Then they receive 403.
- **Source:** `nativedocs/02` #21, per P6

### FR-22 Approve Task

- **Roles:** Project Team Lead, project PM, Admin
- **Story:** As a lead, I approve a task in Review that meets the quality bar.
- **Acceptance criteria:**
  1. Given a task whose status category is `REVIEW`, When a project TEAM_LEAD/PM or Admin approves it, Then, in one atomic operation, the task moves to the default `DONE` status, `TASK_APPROVED` is audited, assignees receive `TASK_APPROVED`, and a `SLACK_UPDATE_THREAD` job is queued.
  2. Given a task not in `REVIEW`, When approve is posted, Then the request is rejected with 400 "Only tasks in review can be approved".
  3. Given a project MEMBER, When they post approve, Then they receive 403.
  4. Given the approver is also an assignee, When they approve, Then the approval is allowed (A2).
- **Source:** `nativedocs/02` #22

### FR-23 Reject and Reopen Task

- **Roles:** Project Team Lead, project PM, Admin
- **Story:** As a lead, I reject a task in Review with a reason, or reopen a Done task, so that it gets reworked.
- **Acceptance criteria:**
  1. Given a task in `REVIEW` and a reason of 1–2,000 characters, When a lead rejects it, Then, atomically, the task moves to the default `IN_PROGRESS` status, the reason is saved as a comment, `TASK_REJECTED` is audited, assignees receive `TASK_REJECTED`, and a Slack thread update is queued.
  2. Given an empty reason, When reject is posted, Then the request is rejected with 400 "A reason is required".
  3. Given a task in `DONE` and a reason, When a lead reopens it, Then the same happens as in criterion 1, with `TASK_REOPENED`.
  4. Given a project MEMBER, When they post reject or reopen, Then they receive 403.
- **Source:** `nativedocs/02` #23, per P6/P7

### FR-24 Audit Log

- **Roles:** Admin (system log); project members (task history)
- **Story:** As an Admin, I trace who changed what and when.
- **Acceptance criteria:**
  1. Given any audited action, When it commits, Then an `audit_logs` row records the actor, the action, the entity type and ID, the changed fields as before/after JSON, and the timestamp. The row is written in the same atomic operation.
  2. Given an Admin, When they open the audit log, Then entries are filterable by actor, entity type, action, and date range, newest first, 50 per page.
  3. Given a project member, When they open a task, Then they see that task's history.
  4. Given a non-Admin, When they open the system audit log, Then they receive 403.
- **Source:** `nativedocs/02` #24

### 4.6 Notifications

### FR-25 Notification Center

- **Roles:** All
- **Story:** As a user, I see my notifications: assignments, new comments, approvals, rejections, and being added to a project.
- **Acceptance criteria:**
  1. Given notifications exist, When the user opens the notification center, Then they see their own notifications, newest first, with an unread count.
  2. Given an unread notification, When the user opens it or chooses "Mark all as read", Then it is marked read.
  3. Given a notification about a task the user can no longer access, When they open it, Then they receive 404 from the target page.
- **Source:** `nativedocs/02` #25

### FR-26 Realtime Notifications

- **Roles:** System
- **Story:** As a user, I receive notifications instantly without reloading the page.
- **Acceptance criteria:**
  1. Given a user with an open page, When a notification for them commits, Then it appears within 2 seconds, and the unread count updates.
  2. Given a dropped connection, When the client reconnects, Then it refetches unread notifications, so nothing created during the outage is missed.
  3. Given an unauthenticated request to the realtime endpoint, When it connects, Then the upgrade is refused with 401.
- **Source:** `nativedocs/02` #26

### 4.7 Integrations

### FR-27 Post Task to Slack

- **Roles:** System
- **Story:** As a team, we see new tasks in the project's Slack channel.
- **Acceptance criteria:**
  1. Given a project with a Slack channel configured and a bot token in the environment, When a task is created, Then a message with the code, title, priority, due date, and link is posted, and the message timestamp is stored as the task's Slack thread.
  2. Given Slack is not configured, When a task is created, Then the job ends as `SKIPPED` and the task creation itself is unaffected.
  3. Given a delivery failure, When it happens, Then the job retries with backoff up to 5 attempts, after which it is marked `DEAD` and logged.
- **Source:** `nativedocs/02` #27

### FR-28 Update Slack Thread

- **Roles:** System
- **Story:** As a team, we see status changes in the task's Slack thread.
- **Acceptance criteria:**
  1. Given a task with a stored Slack thread, When its status changes, Then a reply "Status: <old> → <new> by <user>" is posted in that thread.
  2. Given the task's original post has not been delivered yet, When an update job runs, Then the update waits and posts after the original.
- **Source:** `nativedocs/02` #28

### FR-29 Deadline Email

- **Roles:** System
- **Story:** As an assignee, I get an email when a task is due soon or overdue.
- **Acceptance criteria:**
  1. Given a non-archived task, not Done, due within 24 hours, When the hourly scan runs, Then each assignee gets one `DUE_SOON` email for that due date.
  2. Given an overdue task, When the scan runs, Then each assignee gets one `OVERDUE` email for that due date.
  3. Given the task's due date changes, When the scan runs again, Then reminders are sent again for the new date.
  4. Given the console email sender (default), When a reminder is produced, Then the rendered email is logged. In mock form, the requirement is met when the email is produced and logged.
  5. Given an email failure, When it happens, Then no business data is affected, and the job retries as in FR-27 criterion 3.
- **Source:** `nativedocs/02` #29, per P20

### 4.8 Reports

### FR-30 Member Report

- **Roles:** Project Team Lead, project PM, Admin
- **Story:** As a lead, I see each member's task counts: done, in progress, and overdue.
- **Acceptance criteria:**
  1. Given a project and an optional date range and sprint, When a lead opens the member report, Then each member shows counts of assigned tasks by category, an overdue count, and the number of tasks completed in the range.
  2. Given a project MEMBER, When they open the report, Then they receive 403.
- **Source:** `nativedocs/02` #30

### FR-31 Project Report

- **Roles:** Project PM, Admin
- **Story:** As a PM, I see project progress, sprint completion, and bottlenecks.
- **Acceptance criteria:**
  1. Given a project, When the PM opens the report, Then it shows the share of tasks Done, the task distribution across statuses, completion per sprint (P11), and bottlenecks (P21).
  2. Given a sprint with no top-level tasks, When it is shown, Then its completion reads "No tasks", not 0%.
  3. Given a task in a `REVIEW` status for more than 2 days, When the report is opened, Then it is listed as a stale review.
  4. Given a project TEAM_LEAD or MEMBER, When they open the report, Then they receive 403.
- **Source:** `nativedocs/02` #31

### FR-32 Export

- **Roles:** Project PM, Admin
- **Story:** As a PM, I export project tasks to CSV or Excel.
- **Acceptance criteria:**
  1. Given a project, When the PM exports, Then a CSV (UTF-8 with BOM) or an `.xlsx` file downloads, with one row per non-archived task. Columns: code, title, status, category, priority, assignees, sprint, start date, due date, overdue (yes/no), created at, and updated at.
  2. Given values that begin with `=`, `+`, `-`, or `@`, When they are exported, Then they are prefixed with `'` to prevent formula injection.
  3. Given a project TEAM_LEAD or MEMBER, When they request an export, Then they receive 403.
- **Source:** `nativedocs/02` #32

### 4.9 Dashboard and Timeline

### FR-33 Personal Dashboard

- **Roles:** All (Admin and PM on `/admin`)
- **Story:** As a user, I see what I am working on and what matters today; as an Admin or PM, I see projects at risk.
- **Acceptance criteria:**
  1. Given a user, When they open their home page, Then they see their tasks in `IN_PROGRESS`, their "today's priorities" (P19), and their unread notification count.
  2. Given tasks in projects they can no longer access or archived projects, When the dashboard loads, Then those tasks are not shown.
  3. Given an Admin or PM opening `/admin`, Then they see their personal dashboard data plus `projectsAtRisk: ProjectRiskItem[]`. A project is at risk when it is non-archived and has at least one overdue task per P19 (due date passed in `APP_TIMEZONE`, category ≠ `DONE`, task not archived; sub-tasks included). `ProjectRiskItem` = `{ id, code, name, overdueCount }`, sorted by `overdueCount` descending, then `code` ascending. Admins see all non-archived projects with overdue tasks; PMs see only projects they are a member of.
- **Source:** `nativedocs/02` #33

### FR-34 Overdue Tasks Widget

- **Roles:** All
- **Story:** As a user, I see a warning list of my overdue tasks.
- **Acceptance criteria:**
  1. Given the user has overdue tasks (P19), When the dashboard loads, Then a widget lists them, most overdue first, with the number of days overdue.
  2. Given a task that becomes Done or archived, When the dashboard reloads, Then it no longer appears.
- **Source:** `nativedocs/02` #34

### FR-35 Calendar View

- **Roles:** All
- **Story:** As a user, I see my tasks on a day, week, or month calendar.
- **Acceptance criteria:**
  1. Given tasks with both a start date and a due date, When the calendar renders, Then they show as spans. Tasks with only a due date show on that day, and tasks with no dates are not shown.
  2. Given a project filter, When it is applied, Then only that project's tasks show. The filter is limited to projects the user can access.
  3. Given the user switches between day, week, and month, When the view changes, Then the selection is kept in the URL.
- **Source:** `nativedocs/02` #35

## 5. Non-Functional Requirements

| ID | Area | Requirement |
| :--- | :--- | :--- |
| NFR-01 | Security | Sessions are signed cookies (`HttpOnly`, `Secure`, `SameSite=Lax`) that expire after 7 days. Passwords are hashed with PBKDF2-SHA256, storing the iteration count with each hash. Invite tokens are stored in `invites` only as hashes. The invite email job carries the token AES-GCM-sealed with a Worker secret, and the job payload is cleared when the job finishes. |
| NFR-02 | Authorization | Every permission rule is enforced in the service layer. UI visibility is never a security control. |
| NFR-03 | Validation | Every action validates its input with Zod at the boundary and returns structured 400 errors. |
| NFR-04 | Data integrity | Every multi-record change listed in [Data access](./04-data-access-and-atomicity.md#atomic-operations) is atomic. |
| NFR-05 | Performance | Pages render within the Workers Free plan budget (10 ms CPU per request) where possible. Any breach is tracked as risk R1. |
| NFR-06 | i18n | Every user-facing string comes from translation files in English and Vietnamese. A missing key fails CI. |
| NFR-07 | Accessibility | Form controls have labels, every action works from the keyboard, and color is never the only signal (status, overdue). |
| NFR-08 | Logging | Logs are structured JSON with `requestId`, `userId`, and the target ID where relevant. Secrets, passwords, and tokens are never logged. |
| NFR-09 | Type safety | TypeScript strict mode, with no `any`, `@ts-ignore`, or `@ts-nocheck`. |
| NFR-10 | Portability | Development and tests run fully locally, without a Cloudflare deployment. |

## 6. Out of Scope

- Multi-tenancy, organization switching, public sign-up.
- Full Scrum features: backlog boards, story points, velocity forecasting, sprint states.
- Hard deletion of projects, tasks, sprints, or users.
- Guaranteed email delivery: a real email provider is configured later.
- Custom domains.
- Technologies in the `nativedocs/04` catalog that this project does not use: Vue, Next.js, Babylon.js/Three.js, Express/NestJS, GCP, Docker, MySQL/PostgreSQL, Prisma, AWS.

## 7. Traceability

| FR | Module | WBS row (`wbs.md`) |
| :--- | :--- | :--- |
| FR-01 | Authentication | Login (email / password) |
| FR-02 | Authentication | Login (Google / Microsoft SSO) |
| FR-03 | Users | User CRUD |
| FR-04 | Users | Role assignment |
| FR-05 | Profile | View profile |
| FR-06 | Profile | Update profile |
| FR-07 | Projects | Create project |
| FR-08 | Projects | Update project |
| FR-09 | Projects | Delete project |
| FR-10 | Project members | Add member |
| FR-11 | Project members | Assign role |
| FR-12 | Tasks | Create task |
| FR-13 | Tasks | Update task |
| FR-14 | Tasks | Delete task |
| FR-15 | Tasks | Assign task |
| FR-16 | Tasks | Task list |
| FR-17 | Sub-tasks | Create sub-task |
| FR-18 | Files | Attach file |
| FR-19 | Comments | Comment on task |
| FR-20 | Workflow | Configure statuses |
| FR-21 | Workflow | Change status |
| FR-22 | Approval | Approve task |
| FR-23 | Approval | Reject task |
| FR-24 | Audit log | Change history |
| FR-25 | Notifications | View notifications |
| FR-26 | Notifications | Realtime |
| FR-27 | Slack | Post task to Slack |
| FR-28 | Slack | Update thread |
| FR-29 | Email | Send email |
| FR-30 | Reports | Member report |
| FR-31 | Reports | Project report |
| FR-32 | Export | Export data |
| FR-33 | Overview | Personal dashboard |
| FR-34 | Overview | Overdue tasks |
| FR-35 | Timeline | Calendar view |
| FR-36 | Sprints | Sprint management (new row) |
| FR-37 | Authentication | Accept invite (replaces "Sign up") |
