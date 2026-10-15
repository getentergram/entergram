class GetEntergram < Formula
  desc "Persistent engineering memory for AI coding agents"
  homepage "https://github.com/getentergram/entergram"
  # Built from the published npm tarball: the package already ships bin/, src/ and the
  # prebuilt viz UI, so there is nothing to compile here beyond the native sqlite dep.
  url "https://registry.npmjs.org/get-entergram/-/get-entergram-0.1.4.tgz"
  sha256 "927d35265d5ab5b909994d46b58e16f0700e189e11ab585a82fe72ee02feec5f"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    # `init` writes a store into the sandboxed test dir; doctor must then agree with it.
    system bin/"entergram", "init"
    assert_match "consistent", shell_output("#{bin}/entergram doctor")
  end
end
