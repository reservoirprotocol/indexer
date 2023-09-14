## Debugging and fixing common errors

#### `ReplyError: MISCONF Redis is configured to save RDB snapshots, but it is currently not able to persist on disk.`

This happens when the data stored in Redis reaches the memory limit of the instance (which shouldn't happen unless some grows unbounded). The solution is to first run `config set stop-writes-on-bgsave-error no` and then free up space by clearing any keys.
