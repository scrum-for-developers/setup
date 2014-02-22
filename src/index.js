var settings = require('./settings');
var util = require('./util');
var Q = require('q');
var format = require('util').format;
var fs = require('fs');

var baseUrl = 'https://api.github.com';
var newRepositories = settings.teams;
var log = console.log.bind(console);


function ensureTmpDirExists() {
  if (fs.existsSync(settings.tmp)) {
    log('Deleting previously existing tmp dir.');
    return util.exec('rm -rf ' + settings.tmp)
    .then(function() {
      log('Creating new tmp dir');
      fs.mkdirSync(settings.tmp);
    });
  } else {
    log('Creating new tmp dir');
    fs.mkdirSync(settings.tmp);
    return Q.resolve();
  }
}


function getAllExistingReposities() {
  return util.http.get(format('%s/orgs/%s/repos', baseUrl, settings.target))
  .then(util.http.readBody)
  .then(JSON.parse)
  .then(function(repos) {
    return repos.map(function(repo) {
      return repo.name;
    });
  })
  .then(util.tap('Existing repositories'));
}

function assertNoDuplicatedRepository(existingRepositories) {
  var duplicates = newRepositories.filter(function(newRepository) {
    return existingRepositories.indexOf(newRepository.name) !== -1;
  });

  if (duplicates.length > 0) {
    var names = duplicates.map(function(repo) {
      return repo.name;
    });
    throw new Error('Found duplicate repositories: ' + names.join(', '));
  }
}

function assertCollaboratorsExist() {
  var users = newRepositories.reduce(function(collaborators, repository) {
    return collaborators.concat(repository.collaborators);
  }, []);

  log('Checking collaborators for existence:', users);

  var promises = users.map(function(user) {
    return util.http.get(format('%s/users/%s', baseUrl, user));
  });

  return Q.all(promises)
  .fail(util.tap('Some users are not existing!'));
}

function addCollaborators(repo) {
  if (!repo.collaborators) {
    log('No collaborators for %s', repo.name);
    return Q.resolve();
  }

  log('Adding collaborators to %s', repo.name);

  return Q.all(repo.collaborators.map(function(collaborator) {
    return util.http.put(format('%s/repos/%s/%s/collaborators/%s',
      baseUrl,
      settings.target,
      repo.name,
      collaborator));
  }));
}

function createRepository(repo) {
  log('Creating repository for team %s', repo.name);
  return util.http.post(format('%s/orgs/%s/repos', baseUrl, settings.target), {
    'name': repo.name,
    'description': "a Scrum for Developers training team",
    'has_issues': false,
    'has_wiki': false,
    'has_downloads': false,
    'auto_init': false
  })
  .then(addCollaborators.bind(null, repo));
}

function createRepositories() {
  return Q.all(newRepositories.map(createRepository));
}

function pushTo(repo) {
  var endpoint = format('https://%s:%s@github.com/%s/%s.git',
    settings.user,
    encodeURIComponent(settings.password),
    settings.target,
    repo.name);
  log('Addting remote %s', endpoint);
  return util.exec(format('git remote add %s %s', repo.name, endpoint),
      {'GIT_DIR': format('%s/.git', settings.tmp)})
  .then(function() {
    log('Pushing to remote %s', endpoint);
    return util.exec(format('git push %s master',repo.name),
        {'GIT_DIR': format('%s/.git', settings.tmp)});
  });
}

function doInitialCommits() {
  log('Cloning %s into %s', settings.base, settings.tmp);
  return util.exec(format('git clone %s %s', settings.base, settings.tmp))
  .then(function() {
    log('Finished cloning. Progressing to update of each repository');
    var promise = Q(null);

    newRepositories.forEach(function(repo) {
      promise = promise.then(function() {
        return pushTo(repo);
      });
    })

    return promise;
  });
}

ensureTmpDirExists()
.then(getAllExistingReposities)
.then(assertNoDuplicatedRepository)
.then(assertCollaboratorsExist)
.then(createRepositories)
.then(doInitialCommits)
.done();
