declare module 'minimatch' {
    const minimatch: (...args: unknown[]) => boolean

    export default minimatch
    export { minimatch }
}