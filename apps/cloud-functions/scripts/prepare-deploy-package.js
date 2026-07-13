const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');
const distRoot = path.join(packageRoot, 'dist');
const sourceRoot = path.join(distRoot, 'apps/cloud-functions');
const deployParent = path.join(packageRoot, 'deploy-functions');

const runtimePackage = {
  name: 'baichile-cloudbase-api',
  version: '0.1.0',
  private: true,
  type: 'commonjs',
  main: 'index.js',
  dependencies: {
    '@cloudbase/node-sdk': '^3.18.3',
    'wx-server-sdk': '^4.0.2',
    'ws': '^8.18.0',
  },
  overrides: {
    axios: '1.18.1',
    'lodash.unset': '4.18.0',
    ws: '8.21.0',
  },
};

function copyDirectory(from, to) {
  if (!fs.existsSync(from)) throw new Error(`Missing build output: ${from}`);
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(source, target);
    } else if (!entry.name.endsWith('.map')) {
      fs.copyFileSync(source, target);
    }
  }
}

function replaceInFile(file, replacements) {
  let contents = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) contents = contents.split(from).join(to);
  fs.writeFileSync(file, contents);
}

fs.rmSync(deployParent, { recursive: true, force: true });

for (const functionName of ['api', 'admin-api']) {
  const deployRoot = path.join(deployParent, functionName);
  fs.mkdirSync(deployRoot, { recursive: true });
  copyDirectory(path.join(sourceRoot, 'src'), path.join(deployRoot, 'src'));
  copyDirectory(path.join(sourceRoot, `functions/${functionName}`), deployRoot);
  fs.copyFileSync(path.join(distRoot, 'packages/domain/src/index.js'), path.join(deployRoot, 'src/domain.js'));
  replaceInFile(path.join(deployRoot, 'src/services.js'), [
    ['require("@baichile/domain")', 'require("./domain")'],
  ]);
  replaceInFile(path.join(deployRoot, 'index.js'), [
    ['require("../../src/index")', 'require("./src/index")'],
  ]);
  fs.writeFileSync(path.join(deployRoot, 'package.json'), `${JSON.stringify({
    ...runtimePackage,
    name: `baichile-cloudbase-${functionName}`,
  }, null, 2)}\n`);
}

fs.writeFileSync(path.join(deployParent, 'cloudbaserc.json'), `${JSON.stringify({
  envId: '{{env.CLOUDBASE_ENV_ID}}',
  functionRoot: '.',
  functions: ['api', 'admin-api'].map((name) => ({
    name,
    dir: `./${name}`,
    runtime: 'Nodejs18.15',
    handler: 'index.main',
    timeout: 20,
    memorySize: 256,
    installDependency: true,
    ignore: ['node_modules/**', 'src/**/*.test.js'],
  })),
}, null, 2)}\n`);

console.log(`Prepared CloudBase function packages at ${deployParent}`);
