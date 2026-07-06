# Time Machine

Slow down web games by changing `requestAnimationFrame()`, `performance.now()` and more.

## Usage

1. Copy [this javascript](https://github.com/muyao/time-machine/blob/main/script.min.js).
2. Open DevTools (F12).
3. Go to the `Sources` tab and check if there is a `Threads` dropdown.
   * If there is no `Threads` dropdown, then click the pause button, paste in the script and unpause. You're done, no need to continue to point 4.
4. Do this for each thread:
   * Pause the thread.
   * Paste in the script.
   * Unpause thread.
5. You're done.

To change the factor it slows down, find the `((d=...)=>{...` at the start. `d=1` is when it runs normally. `d=0.5` is half speed. The default, `d=0.2` is 20% speed. To make the game run faster, set d over 1. `d=5` runs at 5x speed.

*Note: If a game uses `setInterval()`, this script won't work because `setInterval()` only gets run once.*

*Note 2: If you end up using the non-minified script, you won't find the `d=`. Change the parameter at the end `...})(0.2);` to get the same effect*

## Contributing

Contributions are what make the open-source community such an amazing place. Any contributions you make are greatly appreciated.

## License

Distributed under the GPLv3 License. See `LICENSE` for more information.