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

function replaceWorkspaceRuntimeImports(sourceDirectory, sourceRoot = sourceDirectory) {
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const file = path.join(sourceDirectory, entry.name);
    if (entry.isDirectory()) {
      replaceWorkspaceRuntimeImports(file, sourceRoot);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const domainPath = path.relative(path.dirname(file), path.join(sourceRoot, 'domain.js'))
      .replaceAll(path.sep, '/');
    replaceInFile(file, [
      ['require("@baichile/domain")', `require("${domainPath.startsWith('.') ? domainPath : `./${domainPath}`}")`],
    ]);
    const contents = fs.readFileSync(file, 'utf8');
    const unresolved = contents.match(/require\(["']@baichile\/[^"']+["']\)/g);
    if (unresolved?.length) {
      throw new Error(`Unresolved workspace runtime import in ${file}: ${unresolved.join(', ')}`);
    }
  }
}

function assertNoUnresolvedRuntimeImports(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assertNoUnresolvedRuntimeImports(file);
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const contents = fs.readFileSync(file, 'utf8');
    const unresolved = [
      ...(contents.match(/require\(["']@baichile\/[^"']+["']\)/g) ?? []),
      ...(contents.match(/require\(["']\.\.\/\.\.\/src\/[^"']+["']\)/g) ?? []),
    ];
    if (unresolved.length) {
      throw new Error(`Unresolved deployment import in ${file}: ${unresolved.join(', ')}`);
    }
  }
}

fs.rmSync(deployParent, { recursive: true, force: true });

for (const functionName of ['api', 'admin-api']) {
  const deployRoot = path.join(deployParent, functionName);
  fs.mkdirSync(deployRoot, { recursive: true });
  copyDirectory(path.join(sourceRoot, 'src'), path.join(deployRoot, 'src'));
  copyDirectory(path.join(sourceRoot, `functions/${functionName}`), deployRoot);
  fs.copyFileSync(path.join(distRoot, 'packages/domain/src/index.js'), path.join(deployRoot, 'src/domain.js'));
  replaceWorkspaceRuntimeImports(path.join(deployRoot, 'src'));
  replaceInFile(path.join(deployRoot, 'index.js'), [
    ['require("../../src/', 'require("./src/'],
  ]);
  assertNoUnresolvedRuntimeImports(deployRoot);
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
