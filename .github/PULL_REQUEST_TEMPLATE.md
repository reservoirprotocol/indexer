# Pull Request Template

<!-- ## Description

Please include a summary of the changes and which issue is fixed. Include relevant motivation and context. List any dependencies that are required for this change. -->

## Database Migration Strategy

For tables such as `orders`, `tokens`, `collections`, etc., we split the deployment into two distinct phases:

1. **PR for Applying Migration Changes:**

   - This PR should solely focus on the database schema changes.
   - Ensure that the migration script is thoroughly tested and is backward compatible.

2. **PR for Applying Code Changes:**
   - This PR should include the code changes that utilize the new database schema.
   - Make sure to handle any new database schema elements within the code.

## Handling New Columns with Default Values

When adding new columns with a default value, follow this approach:

- **Initial Migration Without a Default Value:**

  - Perform the initial migration without setting a default value for the new column.
  - Ensure that the application code is equipped to handle the absence of a default value.

- **Code Modifications:**
  - Adapt the application code to manage the logic around the new column.
  - Once the code is deployed and stable, a subsequent migration can introduce the default value if necessary.

<!-- ## Checklist:

- [ ] I have performed a self-review of my own code.
- [ ] I have commented my code, particularly in hard-to-understand areas.
- [ ] I have made corresponding changes to the documentation.
- [ ] My changes generate no new warnings.
- [ ] I have added tests that prove my fix is effective or that my feature works.
- [ ] New and existing unit tests pass locally with my changes.
- [ ] Any dependent changes have been merged and published in downstream modules. -->

## Additional Notes

Include any additional information that you believe is important for the reviewers to know.
