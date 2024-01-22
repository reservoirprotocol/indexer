// sequential number 108
const branch = process.env.GITHUB_REF_NAME;

module.exports = {
  'dryRun': false,
  'branches': [
    'main',
    { name: 'development', channel: 'dev', prerelease: 'dev' },
    { name: 'DEVO-28_semantic_version', channel: 'test', prerelease: 'test' },
  ],
  'plugins': [
    '@semantic-release/commit-analyzer',
    // '@semantic-release/release-notes-generator',
    // [
    //   '@semantic-release/changelog',
    //   {
    //     'changelogFile': `docs/CHANGELOG_${branch}.md`,
    //   }
    // ],
    // ['@semantic-release/npm', {
    //   'npmPublish': false,
    //   'pkgRoot': 'packages/indexer/',
    // }],
    // '@semantic-release/github',
    // [
    //   '@semantic-release/git',
    //   {
    //     'assets': [
    //       `docs/CHANGELOG_${branch}.md`,
    //       'packages/indexer/package.json',
    //     ],
    //     'message': 'ci(release): update changelogs for ${nextRelease.version} [skip release][skip ci]'
    //   }
    // ],
    // ['@semantic-release/exec', {
    //   'generateNotes': `git pull origin '+refs/notes/semantic-release:refs/notes/semantic-release'`,
    //   'prepare': `git pull origin '+refs/notes/semantic-release:refs/notes/semantic-release'`,
    // }]
  ]
};
