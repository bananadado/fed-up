{
  description = "Development shell for the drp03 Bun/React app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          nodejs_24
          git
          jq
          eslint
          prettier
          typescript
          typescript-language-server
          playwright-driver.browsers
        ];

        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "1";
        NPM_CONFIG_UPDATE_NOTIFIER = "false";
        VERCEL_TELEMETRY_DISABLED = "1";

        shellHook = ''
          export PATH="$PWD/node_modules/.bin:$PATH"
          export BUN_INSTALL_CACHE_DIR="$PWD/.bun/install/cache"

          echo "drp03 Bun/React dev shell"
          echo "  bun install --frozen-lockfile  install workspace dependencies"
          echo "  bun run dev                    run the Bun dev server"
          echo "  bun run lint                   run ESLint"
          echo "  bun run typecheck              run TypeScript checks"
          echo "  bun run test:unit              run Bun unit tests"
          echo "  bun run test:e2e               run Playwright Chromium tests"
          echo "  bun run audit                  run dependency audit"
          echo "  bun run build                  build dist/"
        '';
      };
    };
}
