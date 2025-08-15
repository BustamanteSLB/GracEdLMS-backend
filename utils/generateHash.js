// Temporary script to generate a password hash
const bcrypt = require('bcryptjs');

const plainPassword = 'root_admin2';
const saltRounds = 10; // Use the same salt rounds you use for hashing during registration

bcrypt.hash(plainPassword, saltRounds, function(err, hash) {
    if (err) {
        console.error(err);
    } else {
        console.log('Hash for "root_admin":');
        console.log(hash);
    }
});