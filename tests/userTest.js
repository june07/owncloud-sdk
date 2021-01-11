describe('Main: Currently testing user management,', function () {
  var OwnCloud = require('../src/owncloud')
  var config = require('./config/config.json')

  // LIBRARY INSTANCE
  var oc

  // PACT setup
  const Pact = require('@pact-foundation/pact-web')
  const provider = new Pact.PactWeb()
  const {
    ocsMeta,
    CORSPreflightRequest,
    capabilitiesGETRequestValidAuth,
    GETRequestToCloudUserEndpoint,
    createAUser,
    deleteAUser,
    createAUserWithGroupMembership,
    pactCleanup
  } = require('./pactHelper.js')
  const { accessControlAllowMethods, validAuthHeaders, xmlResponseHeaders } = require('./pactHelper.js')

  const aRequestToGetUserInformation = function (requestName, username, responseBody) {
    return {
      uponReceiving: 'a request to GET user information ' + requestName,
      withRequest: {
        method: 'GET',
        path: Pact.Matchers.term({
          matcher: '.*\\/ocs\\/v1\\.php\\/cloud\\/users\\/' + username + '$',
          generate: '/ocs/v1.php/cloud/users/' + username
        }),
        headers: validAuthHeaders
      },
      willRespondWith: {
        status: 200,
        headers: xmlResponseHeaders,
        body: responseBody
      }
    }
  }

  const aGETRequestToListUsers = function (requestName, query, bodyData) {
    return {
      uponReceiving: 'a request to list all users ' + requestName,
      withRequest: {
        method: 'GET',
        path: Pact.Matchers.term({
          matcher: '.*\\/ocs\\/v1\\.php\\/cloud\\/users$',
          generate: '/ocs/v1.php/cloud/users'
        }),
        query: query,
        headers: validAuthHeaders
      },
      willRespondWith: {
        status: 200,
        headers: xmlResponseHeaders,
        body: '<?xml version="1.0"?>\n' +
          '<ocs>\n' +
          ocsMeta('ok', '100') +
          ' <data>\n' +
          bodyData +
          ' </data>\n' +
          '</ocs>\n'
      }
    }
  }

  const aPUTRequestToSetUserAttribute = function (requestName, username, requestBody, response) {
    return {
      uponReceiving: 'set user attribute of an ' + requestName,
      withRequest: {
        method: 'PUT',
        path: Pact.Matchers.regex({
          matcher: '.*\\/ocs\\/v(1|2)\\.php\\/cloud\\/users\\/' + username,
          generate: '/ocs/v1.php/cloud/users/' + username
        }),
        headers: validAuthHeaders,
        body: requestBody
      },
      willRespondWith: {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Content-Type': 'text/xml; charset=utf-8',
          'Access-Control-Allow-Methods': accessControlAllowMethods
        },
        body: '<?xml version="1.0"?>\n' +
          '<ocs>\n' +
          response +
          ' <data/>\n' +
          '</ocs>\n'
      }
    }
  }

  const aPOSTRequestToAddUsersToGroup = function (requestName, username, group) {
    return {
      uponReceiving: 'add user to group with an existent user and a non existent group ' + requestName,
      withRequest: {
        method: 'POST',
        path: Pact.Matchers.term({
          matcher: '.*\\/ocs\\/v1\\.php\\/cloud\\/users\\/' + username + '\\/groups$',
          generate: '/ocs/v1.php/cloud/users/' + username + '/groups'
        }),
        headers: validAuthHeaders,
        body: 'groupid=' + group
      },
      willRespondWith: {
        status: 200,
        headers: xmlResponseHeaders,
        body: '<?xml version="1.0"?>\n' +
          '<ocs>\n' +
          ocsMeta('failure', 102) +
          ' <data/>\n' +
          '</ocs>'
      }
    }
  }

  const aRequestToGetGroupOfAUser = function (requestName, username, responseBody) {
    return {
      // TODO: for provider test, need to add a state to put user in group
      uponReceiving: 'a request to GET the groups that a user is a member of ',
      withRequest: {
        method: 'GET',
        path: Pact.Matchers.term({
          matcher: '.*\\/ocs\\/v1\\.php\\/cloud\\/users\\/' + username + '\\/groups$',
          generate: '/ocs/v1.php/cloud/users/' + username + '/groups'
        }),
        headers: validAuthHeaders
      },
      willRespondWith: {
        status: 200,
        headers: xmlResponseHeaders,
        body: responseBody
      }
    }
  }

  const aDELETERequestToRemoveUserFromAGroup = function (requestName, username, group) {
    return {
      uponReceiving: 'Remove user from a group ' + requestName,
      withRequest: {
        method: 'DELETE',
        path: Pact.Matchers.term({
          matcher: '.*\\/ocs\\/v(1|2)\\.php\\/cloud\\/users\\/' + username + '\\/groups$',
          generate: '/ocs/v1.php/cloud/users/' + username + '/groups'
        }),
        headers: validAuthHeaders,
        body: 'groupid=' + group
      },
      willRespondWith: {
        status: 200,
        headers: xmlResponseHeaders,
        body: '<?xml version="1.0"?>\n' +
          '<ocs>\n' +
          ocsMeta('failure', 102) +
          ' <data/>\n' +
          '</ocs>\n'
      }
    }
  }

  const aPOSTRequestToAddUserToSubAdminGroup = function (request, username, group, responseOcsMeta) {
    return {
      uponReceiving: 'Add user to subadmin group ' + request,
      withRequest: {
        method: 'POST',
        path: Pact.Matchers.term({
          matcher: '.*\\/ocs\\/v(1|2)\\.php\\/cloud\\/users\\/' + username + '\\/subadmins$',
          generate: '/ocs/v1.php/cloud/users/' + username + '/subadmins'
        }),
        headers: validAuthHeaders,
        body: 'groupid=' + group
      },
      willRespondWith: {
        status: 200,
        headers: xmlResponseHeaders,
        body: '<?xml version="1.0"?>\n' +
          '<ocs>\n' +
          responseOcsMeta +
          ' <data/>\n' +
          '</ocs>\n'
      }
    }
  }

  const aRequestToGetUserSubAdminGroup = function (requestName, username, responseBody) {
    return {
      // TODO: for provider test, need to add a state to make user subadmin of the group
      uponReceiving: 'a request to GET groups that a user is a subadmin of ' + requestName,
      withRequest: {
        method: 'GET',
        path: Pact.Matchers.term({
          matcher: '.*\\/ocs\\/v1\\.php\\/cloud\\/users\\/' + username + '\\/subadmins$',
          generate: '/ocs/v1.php/cloud/users/' + username + '/subadmins'
        }),
        headers: validAuthHeaders
      },
      willRespondWith: {
        status: 200,
        headers: xmlResponseHeaders,
        body: responseBody
      }
    }
  }

  beforeAll(function () {
    const promises = []
    promises.push(provider.addInteraction(CORSPreflightRequest()))
    promises.push(provider.addInteraction(capabilitiesGETRequestValidAuth()))
    promises.push(provider.addInteraction(GETRequestToCloudUserEndpoint()))
    promises.push(provider.addInteraction(createAUser()))
    promises.push(provider.addInteraction(deleteAUser()))
    promises.push(provider.addInteraction(createAUserWithGroupMembership()))
    promises.push(provider.addInteraction(aRequestToGetUserInformation(
      'of an existing user',
      config.username,
      '<?xml version="1.0"?>\n' +
      '<ocs>\n' +
      ocsMeta('ok', '100') +
      ' <data>\n' +
      '  <enabled>true</enabled>\n' +
      '  <quota>\n' +
      '   <free>57800708096</free>\n' + // TODO need to be made more flexible for provider tests
      '   <used>2740027</used>\n' +
      '   <total>57803448123</total>\n' +
      '   <relative>0</relative>\n' +
      '   <definition>default</definition>\n' +
      '  </quota>\n' +
      '  <email/>\n' +
      '  <displayname>' + config.username + '</displayname>\n' +
      '  <two_factor_auth_enabled>false</two_factor_auth_enabled>\n' +
      ' </data>\n' +
      '</ocs>\n'
    )))
    promises.push(provider.addInteraction(aRequestToGetUserInformation(
      'of a non-existent user',
      config.nonExistentUser,
      '<?xml version="1.0"?>\n' +
            '<ocs>\n' +
            ocsMeta('failure', 998, 'The requested user could not be found') +
            ' <data/>\n' +
            '</ocs>\n'
    )))
    promises.push(provider.addInteraction(aGETRequestToListUsers(
      'to list a non-existent user',
      'search=' + config.nonExistentUser,
      '  <users/>\n'
    )
    ))
    promises.push(provider.addInteraction(aGETRequestToListUsers(
      'to list a single existent user',
      'search=' + config.username,
      '  <users>\n' +
            '   <element>' + config.username + '</element>\n' +
            '  </users>\n'
    )
    ))
    promises.push(provider.addInteraction(aRequestToGetUserInformation(
      ' to get user attribute of an existent user',
      config.testUser,
      '<?xml version="1.0"?>\n' +
            '<ocs>\n' +
            ocsMeta('ok', '100') +
            ' <data>\n' +
            '  <enabled>true</enabled>\n' +
            '  <quota>\n' +
            '   <definition>default</definition>\n' +
            '  </quota>\n' +
            '  <email>asd@a.com</email>\n' +
            '  <displayname>test123</displayname>\n' +
            '  <two_factor_auth_enabled>false</two_factor_auth_enabled>\n' +
            ' </data>\n' +
            '</ocs>'
    )))
    promises.push(provider.addInteraction(aRequestToGetGroupOfAUser(
      ' with existent user',
      config.testUser,
      '<?xml version="1.0"?>\n' +
            '<ocs>\n' +
            ocsMeta('ok', '100') +
            ' <data>\n' +
            '  <groups>\n' +
            '   <element>' + config.testGroup + '</element>\n' +
            '  </groups>\n' +
            ' </data>\n' +
            '</ocs>\n'
    )))
    promises.push(provider.addInteraction(aRequestToGetGroupOfAUser(
      ' with a non-existent user',
      config.nonExistentUser,
      '<?xml version="1.0"?>\n' +
            '<ocs>\n' +
            ocsMeta('failure', 998) +
            ' <data/>\n' +
            '</ocs>'
    )))
    promises.push(provider.addInteraction(aRequestToGetUserSubAdminGroup(
      ' with an existent user',
      config.testUser,
      '<?xml version="1.0"?>\n' +
      '<ocs>\n' +
      ocsMeta('ok', '100') +
      ' <data>\n' +
      '   <element>' + config.testGroup + '</element>\n' +
      ' </data>\n' +
      '</ocs>\n'
    )))
    promises.push(provider.addInteraction(aRequestToGetUserSubAdminGroup(
      ' with a non-existent user',
      config.nonExistentUser,
      '<?xml version="1.0"?>\n' +
      '<ocs>\n' +
      ocsMeta('failure', 101, 'User does not exist') +
      ' <data/>\n' +
      '</ocs>\n'
    )))
    return Promise.all(promises)
  })

  afterAll(function () {
    return pactCleanup(provider)
  })

  beforeEach(function () {
    oc = new OwnCloud({
      baseUrl: config.owncloudURL,
      auth: {
        basic: {
          username: config.username,
          password: config.password
        }
      }
    })

    return oc.login().then(status => {
      expect(status).toEqual({ id: 'admin', 'display-name': 'admin', email: {} })
    })
  })

  describe('added testUser to testGroup,', function () {
    it('checking method : getUserGroups with an existent user', function (done) {
      oc.users.getUserGroups(config.testUser).then(data => {
        expect(typeof (data)).toEqual('object')
        expect(data.indexOf(config.testGroup)).toBeGreaterThan(-1)
        done()
      }).catch(error => {
        expect(error).toBe(null)
        done()
      })
    })

    it('checking method : userIsInGroup with an existent user, existent group', function (done) {
      oc.users.userIsInGroup(config.testUser, config.testGroup).then(status => {
        expect(status).toBe(true)
        done()
      }).catch(error => {
        expect(error).toBe(null)
        done()
      })
    })
  })

  describe('made testUser as testGroup subAdmin', function () {
    it('checking method : getUserSubadminGroups with an existent user', function (done) {
      oc.users.getUserSubadminGroups(config.testUser).then(data => {
        expect(typeof (data)).toEqual('object')
        expect(data.indexOf(config.testGroup)).toBeGreaterThan(-1)
        done()
      }).catch(error => {
        expect(error).toBe(null)
        done()
      })
    })
  })

  it('checking method : getUser on an existent user', function (done) {
    oc.users.getUser(config.username).then(data => {
      expect(typeof (data)).toEqual('object')
      expect(data.displayname).toEqual(config.username)
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : getUser on a non existent user', function (done) {
    oc.users.getUser(config.nonExistentUser).then(user => {
      expect(user).toBe(null)
      done()
    }).catch(error => {
      expect(error).toBe('The requested user could not be found')
      done()
    })
  })

  it('checking method : createUser & deleteUser', function (done) {
    oc.users.createUser(config.testUser, config.testUserPassword).then(data => {
      expect(data).toEqual(true)
      return oc.users.deleteUser(config.testUser)
    }).then(status => {
      expect(status).toBe(true)
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : createUser with groups', function (done) {
    oc.users.createUser(config.testUser, config.testUserPassword, [config.testGroup]).then((data) => {
      expect(data).toEqual(true)
      return oc.users.userIsInGroup(config.testUser, config.testGroup)
    }).then((status) => {
      expect(status).toBe(true)
      return oc.users.deleteUser(config.testUser)
    }).then((status) => {
      expect(status).toBe(true)
      done()
    }).catch((error) => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : searchUsers', async function (done) {
    await provider.addInteraction(aGETRequestToListUsers(
      'to get all users',
      '',
      '  <users>\n' +
      '   <element>' + config.username + '</element>\n' +
      '   <element>' + config.testUser + '</element>\n' +
      '  </users>\n'
    ))
    oc.users.searchUsers('').then(data => {
      expect(typeof (data)).toEqual('object')
      expect(data.indexOf(config.username)).toBeGreaterThan(-1)
      expect(data.indexOf(config.testUser)).toBeGreaterThan(-1)
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : searchUsers with zero user results', function (done) {
    oc.users.searchUsers(config.nonExistentUser).then(data => {
      expect(typeof (data)).toEqual('object')
      expect(data.length).toEqual(0)
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : userExists with existent user', function (done) {
    oc.users.userExists(config.username).then(status => {
      expect(status).toBe(true)
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : userExists with non existent user', function (done) {
    oc.users.userExists(config.nonExistentUser).then(status => {
      expect(status).toBe(false)
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : setUserAttribute of an existent user, allowed attribute', async function (done) {
    await provider.addInteraction(aPUTRequestToSetUserAttribute(
      ' an existent user, attribute is allowed',
      config.testUser,
      'key=email&value=asd%40a.com',
      ocsMeta('ok', '100')
    ))
    oc.users.setUserAttribute(config.testUser, 'email', 'asd@a.com').then(data => {
      expect(data).toEqual(true)
      return oc.users.getUser(config.testUser)
    }).then(user => {
      expect(typeof (user)).toEqual('object')
      expect(user.email).toEqual('asd@a.com')
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : setUserAttribute of an existent user, not allowed attribute', async function (done) {
    await provider.addInteraction(aPUTRequestToSetUserAttribute(
      ' an existent user, attribute is not allowed',
      config.testUser,
      'key=email&value=%C3%83%C2%A4%C3%83%C2%B6%C3%83%C2%BC%C3%83%C2%A4%C3%83%C2%A4_sfsdf%2B%24%25%2F)%25%26%3D',
      ocsMeta('failure', 102)
    ))

    oc.users.setUserAttribute(config.testUser, 'email', 'äöüää_sfsdf+$%/)%&=')
      .then(status => {
        expect(status).toBe(null)
        done()
      }).catch(error => {
        // FULL REQUEST RESPONSE RETURNED
        expect(typeof (error)).toBe('object')
        expect(error.ocs.meta.statuscode).toEqual('102')
        done()
      })
  })

  it('checking method : setUserAttribute of a non existent user', async function (done) {
    await provider.addInteraction(aPUTRequestToSetUserAttribute(
      ' a non existent user',
      config.nonExistentUser,
      'key=email&value=asd%40a.com',
      ocsMeta('failure', 997)
    ))

    oc.users.setUserAttribute(config.nonExistentUser, 'email', 'asd@a.com').then(status => {
      expect(status).toBe(null)
      done()
    }).catch(error => {
      expect(typeof (error)).toBe('object')
      expect(error.ocs.meta.statuscode).toEqual('997')
      done()
    })
  })

  it('checking method : addUserToGroup with existent user, non existent group', async function (done) {
    await provider.addInteraction(aPOSTRequestToAddUsersToGroup(
      'with an existent user and a non existent group',
      config.testUser,
      config.nonExistentGroup
    ))

    oc.users.addUserToGroup(config.testUser, config.nonExistentGroup)
      .then(status => {
        expect(status).toBe(null)
        done()
      }).catch(error => {
        // FULL RESPONSE IS RETURNED
        expect(typeof (error)).toBe('object')
        expect(error.ocs.meta.statuscode).toEqual('102')
        done()
      })
  })

  it('checking method : addUserToGroup with non existent user, existent group', async function (done) {
    await provider.addInteraction(aPOSTRequestToAddUsersToGroup(
      'with a non-existent user and an existent group',
      config.nonExistentUser,
      config.testGroup
    ))

    oc.users.addUserToGroup(config.nonExistentUser, config.testGroup).then(status => {
      expect(status).toBe(null)
      done()
    }).catch(error => {
      expect(typeof (error)).toBe('object')
      expect(error.ocs.meta.statuscode).toEqual('102')
      done()
    })
  })

  it('checking method : getUserGroups with a non existent user', function (done) {
    oc.users.getUserGroups(config.nonExistentUser).then(data => {
      expect(typeof (data)).toBe('object')
      expect(data.length).toEqual(0)
      done()
    }).catch(error => {
      expect(typeof (error)).toBe('object')
      expect(error.ocs.meta.statuscode).toEqual('998')
      done()
    })
  })

  it('checking method : userIsInGroup with an existent user but a group the user isn\'t part of', function (done) {
    oc.users.userIsInGroup(config.testUser, 'admin').then(status => {
      expect(status).toEqual(false)
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : userIsInGroup with an existent user, non existent group', function (done) {
    oc.users.userIsInGroup(config.testUser, config.nonExistentGroup)
      .then(status => {
        expect(status).toEqual(false)
        done()
      }).catch(error => {
        expect(error).toBe(null)
        done()
      })
  })

  it('checking method : userIsInGroup with a non existent user', function (done) {
    oc.users.userIsInGroup(config.nonExistentUser, config.testGroup).then(status => {
      expect(status).toBe(null)
      done()
    }).catch(error => {
      expect(typeof (error)).toBe('object')
      expect(error.ocs.meta.statuscode).toEqual('998')
      done()
    })
  })

  it('checking method : getUser with an existent user', function (done) {
    oc.users.getUser(config.testUser).then(data => {
      expect(typeof (data)).toEqual('object')
      expect(data.displayname).toEqual(config.testUser)
      done()
    }).catch(error => {
      expect(error).toBe(null)
      done()
    })
  })

  it('checking method : getUser with a non existent user', function (done) {
    oc.users.getUser(config.nonExistentUser).then(status => {
      expect(status).toBe(true)
      done()
    }).catch(error => {
      expect(error).toEqual('The requested user could not be found')
      done()
    })
  })

  it('checking method : removeUserFromGroup with existent user, non existent group', async function (done) {
    await provider.addInteraction(aDELETERequestToRemoveUserFromAGroup(
      'with existent user and non-existent group',
      config.testUser,
      config.nonExistentGroup
    ))
    oc.users.removeUserFromGroup(config.testUser, config.nonExistentGroup)
      .then(status => {
        expect(status).toBe(null)
        done()
      }).catch(error => {
        expect(typeof (error)).toBe('object')
        expect(error.ocs.meta.statuscode).toEqual('102')
        done()
      })
  })

  it('checking method : removeUserFromGroup with non existent user, existent group', async function (done) {
    await provider.addInteraction(aDELETERequestToRemoveUserFromAGroup(
      'with a non-existent user and an existent group',
      config.nonExistentUser,
      config.testGroup
    ))
    oc.users.removeUserFromGroup(config.nonExistentUser, config.testGroup)
      .then(status => {
        expect(status).toBe(null)
        done()
      }).catch(error => {
        expect(typeof (error)).toBe('object')
        expect(error.ocs.meta.statuscode).toEqual('102')
        done()
      })
  })

  it('checking method : addUserToSubadminGroup with existent user, non existent group', async function (done) {
    await provider.addInteraction(aPOSTRequestToAddUserToSubAdminGroup(
      'with existent user non existent group',
      config.testUser,
      config.nonExistentGroup,
      ocsMeta('failure', 102, 'Group:thisGroupShouldNotExist does not exist')
    ))
    oc.users.addUserToSubadminGroup(config.testUser, config.nonExistentGroup)
      .then(status => {
        expect(status).toBe(null)
        done()
      }).catch(error => {
        expect(error).toBe('Group:' + config.nonExistentGroup + ' does not exist')
        done()
      })
  })

  it('checking method : addUserToSubadminGroup with non existent user, existent group', async function (done) {
    await provider.addInteraction(aPOSTRequestToAddUserToSubAdminGroup(
      'with a non-existent user and an existent group',
      config.nonExistentUser,
      config.testGroup,
      ocsMeta('failure', 101, 'User does not exist')
    ))
    oc.users.addUserToSubadminGroup(config.nonExistentUser, config.testGroup).then(status => {
      expect(status).toBe(null)
      done()
    }).catch(error => {
      expect(error).toBe('User does not exist')
      done()
    })
  })

  it('checking method : getUserSubadminGroups with a non existent user', function (done) {
    oc.users.getUserSubadminGroups(config.nonExistentUser).then(data => {
      expect(typeof (data)).toBe('object')
      expect(data.length).toEqual(0)
      done()
    }).catch(error => {
      expect(error).toBe('User does not exist')
      done()
    })
  })

  it('checking method : userIsInSubadminGroup with existent user, non existent group', function (done) {
    oc.users.userIsInSubadminGroup(config.testUser, config.nonExistentGroup)
      .then(status => {
        expect(status).toBe(false)
        done()
      }).catch(error => {
        expect(error).toBe(null)
        done()
      })
  })

  it('checking method : userIsInSubadminGroup with non existent user, existent group', function (done) {
    oc.users.userIsInSubadminGroup(config.nonExistentUser, config.testGroup)
      .then(status => {
        expect(status).toBe(null)
        done()
      }).catch(error => {
        expect(error).toBe('User does not exist')
        done()
      })
  })

  it('checking method : deleteUser on a non existent user', async function (done) {
    await provider.addInteraction({
      uponReceiving: 'a request to delete a non-existent user',
      withRequest: {
        method: 'DELETE',
        path: Pact.Matchers.term({
          matcher: '.*\\/ocs\\/v1\\.php\\/cloud\\/users\\/' + config.nonExistentUser + '$',
          generate: '/ocs/v1.php/cloud/users/' + config.nonExistentUser
        }),
        headers: validAuthHeaders
      },
      willRespondWith: {
        status: 200,
        headers: xmlResponseHeaders,
        body: '<?xml version="1.0"?>\n' +
          '<ocs>\n' +
          ocsMeta('failure', 101) +
          '  <data/>\n' +
          '</ocs>\n'
      }
    })
    oc.users.deleteUser(config.nonExistentUser).then(status => {
      expect(status).toBe(null)
      done()
    }).catch(error => {
      expect(typeof (error)).toBe('object')
      expect(error.ocs.meta.statuscode).toEqual('101')
      done()
    })
  })
})
