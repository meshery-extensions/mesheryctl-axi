# <a name="contributing">Contributing Overview</a>

Please do! Thank you for your help in improving Meshery! :balloon:

Find the complete set of contributor guides at https://docs.meshery.io/project/contributing

## Developing mesheryctl-axi

Install Node.js 22 or newer and
[`mesheryctl`](https://docs.meshery.io/installation/mesheryctl) before working on
the package. Install dependencies, build the TypeScript sources, and run the test
suite with:

```bash
make setup build tests
```

Run the CLI directly from source while developing, passing commands through
`ARGS`:

```bash
make dev ARGS="connection list"
```

All commits must include a
[Developer Certificate of Origin sign-off](https://github.com/meshery/meshery/blob/master/CONTRIBUTING.md#signing-off-on-commits-developer-certificate-of-origin):

```bash
git commit -s
```
