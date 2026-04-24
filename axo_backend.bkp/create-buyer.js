const bcrypt = require('bcrypt');

const password = 'Buyer@123';
const hash = bcrypt.hashSync(password, 10);

console.log('Password:', password);
console.log('Hash:', hash);
console.log('\nSQL to run in psql:');
console.log(`INSERT INTO users (email, password_hash, organization_id, first_name, last_name, user_role, is_active, status, must_change_password) 
VALUES ('buyer@axo.com', '${hash}', 2, 'Buyer', 'User', 'user', true, 'active', false);`);
