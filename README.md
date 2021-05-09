# Ollert

A terrible-looking kanban board; built with NodeJS and VanillaJS

## Functionality

- User signup/signin with password, google, facebook
- Create boards, lists, list-items
- Mark list-items as done, or delete them

## Dependencies

- MongoDB: database; there must be a unique index on the `username` field of the `users` collection
- Redis: for email-verification and password-reset token storage

## To do

- Move vars that should be in env out of the config file and into env
